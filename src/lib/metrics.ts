import { randomUUID } from "node:crypto";
import type { RuntimeSlot } from "@prisma/client";
import { getPrisma } from "./prisma";
import { maybePruneTelemetry } from "./telemetry-retention";
import type { MetricSnapshot, TimeSeriesPoint } from "./types";

const WINDOW_MINUTES = 5;
const MIN_DRIFT_SAMPLES = 30;
function round(value: number, digits = 2) { const scale = 10 ** digits; return Math.round(value * scale) / scale; }
function threshold(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}
export const alertThresholds = {
  p95Ms: threshold("MONITOR_SLO_P95_MS", 80, 1, 60_000),
  successPercent: threshold("MONITOR_SLO_SUCCESS_PERCENT", 99, 1, 100),
  driftScore: threshold("MONITOR_DRIFT_THRESHOLD", 0.5, 0.01, 10),
  minRequests: threshold("MONITOR_ALERT_MIN_REQUESTS", 20, 1, 100_000),
};

type AggregateRow = { requests: bigint; successes: bigint; demo: bigint; average: number | null;
  p50: number | null; p95: number | null; p99: number | null };
type FeatureRow = { versionId: string; count: bigint; sepalLength: number; sepalWidth: number;
  petalLength: number; petalWidth: number };
type DriftResult = { versionId: string; sampleCount: number; minimumSamples: number; score: number | null; referenceSource: string | null };

export async function getDrift(windowStart = new Date(Date.now() - 60 * 60_000)): Promise<DriftResult[]> {
  const prisma = getPrisma();
  const [rows, references] = await Promise.all([
    prisma.$queryRaw<FeatureRow[]>`
      SELECT "versionId", COUNT(*) AS count,
        AVG(("features"->>'sepal_length')::double precision)::double precision AS "sepalLength",
        AVG(("features"->>'sepal_width')::double precision)::double precision AS "sepalWidth",
        AVG(("features"->>'petal_length')::double precision)::double precision AS "petalLength",
        AVG(("features"->>'petal_width')::double precision)::double precision AS "petalWidth"
      FROM "InferenceRequest" WHERE "createdAt" >= ${windowStart} AND "status" = 'success'
        AND "role" <> 'shadow' AND "features" IS NOT NULL GROUP BY "versionId"`,
    prisma.featureReference.findMany(),
  ]);
  const byVersion = new Map(references.map((reference) => [reference.versionId, reference]));
  return rows.map((row) => {
    const reference = byVersion.get(row.versionId);
    const sampleCount = Number(row.count);
    const mean = reference?.mean as number[] | undefined;
    const scale = reference?.scale as number[] | undefined;
    const observed = [row.sepalLength, row.sepalWidth, row.petalLength, row.petalWidth];
    return { versionId: row.versionId, sampleCount, minimumSamples: MIN_DRIFT_SAMPLES,
      score: reference && sampleCount >= MIN_DRIFT_SAMPLES && mean?.length === 4 && scale?.length === 4
        ? round(Math.max(...observed.map((value, index) => Math.abs(value - mean[index]) / scale[index])), 3) : null,
      referenceSource: reference?.source ?? null };
  });
}

async function recordAlert(kind: string, observed: number, limit: number, message: string, now: Date) {
  const bucket = new Date(Math.floor(now.getTime() / 300_000) * 300_000);
  const fingerprint = `${kind}:${bucket.toISOString()}`;
  await getPrisma().alertEvent.upsert({ where: { fingerprint }, update: { observed },
    create: { id: randomUUID(), fingerprint, kind, severity: "warning", message,
      observed, threshold: limit, windowStart: bucket } });
}

async function probeRuntime(slot: RuntimeSlot, now: Date) {
  const url = slot === "blue" ? process.env.INFERENCE_RUNTIME_URL ?? "http://127.0.0.1:8001"
    : process.env.INFERENCE_RUNTIME_GREEN_URL ?? "http://127.0.0.1:8002";
  const started = performance.now();
  let healthy = false;
  let errorCode: string | null = null;
  try {
    const token = process.env.INFERENCE_RUNTIME_TOKEN;
    if (!token || token.length < 32) throw new Error("runtime credential missing");
    const response = await fetch(`${url.replace(/\/$/, "")}/readyz`, { headers: { "X-NeuralFlow-Runtime-Token": token }, signal: AbortSignal.timeout(1_000), cache: "no-store" });
    const body = await response.json() as { status?: string };
    healthy = response.ok && body.status === "ready";
    if (!healthy) errorCode = "runtime_not_ready";
  } catch { errorCode = "runtime_unavailable"; }
  const latencyMs = round(performance.now() - started, 3);
  const bucketAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  await getPrisma().runtimeHealthSample.upsert({ where: { slot_bucketAt: { slot, bucketAt } },
    update: { healthy, latencyMs, errorCode },
    create: { id: randomUUID(), slot, healthy, latencyMs, errorCode, bucketAt } });
  if (!healthy) await recordAlert(`runtime_${slot}`, 0, 1, `${slot} runtime is unavailable or not ready`, now);
  return { slot, healthy, latencyMs, errorCode };
}

export async function generateSnapshot(now = new Date()): Promise<MetricSnapshot> {
  const prisma = getPrisma();
  const since = new Date(now.getTime() - WINDOW_MINUTES * 60_000);
  const [rows, modelsLive, rollingOut, distributionRows, drift, runtimeHealth] = await Promise.all([
    prisma.$queryRaw<AggregateRow[]>`
      SELECT COUNT(*) FILTER (WHERE "status" = 'success' OR ("status" = 'failed' AND "role" = 'stable'))::bigint AS requests,
        COUNT(*) FILTER (WHERE "status" = 'success')::bigint AS successes,
        COUNT(*) FILTER (WHERE "source" = 'demo' AND ("status" = 'success' OR ("status" = 'failed' AND "role" = 'stable')))::bigint AS demo,
        AVG(COALESCE("gatewayMs", "inferenceMs")) FILTER (WHERE "status" = 'success')::double precision AS average,
        percentile_cont(0.50) WITHIN GROUP (ORDER BY COALESCE("gatewayMs", "inferenceMs"))
          FILTER (WHERE "status" = 'success') AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY COALESCE("gatewayMs", "inferenceMs"))
          FILTER (WHERE "status" = 'success') AS p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY COALESCE("gatewayMs", "inferenceMs"))
          FILTER (WHERE "status" = 'success') AS p99
      FROM "InferenceRequest" WHERE "createdAt" >= ${since} AND "createdAt" <= ${now} AND "role" <> 'shadow'`,
    prisma.servingRoute.count(),
    prisma.registryDeployment.count({ where: { status: "running" } }),
    prisma.inferenceRequest.groupBy({ by: ["versionId", "source"], where: { createdAt: { gte: since, lte: now },
      status: "success", role: { not: "shadow" } }, _count: { _all: true } }),
    getDrift(new Date(now.getTime() - 60 * 60_000)),
    Promise.all([probeRuntime("blue", now), probeRuntime("green", now)]),
  ]);
  const aggregate = rows[0];
  const requestCount = Number(aggregate.requests);
  const successCount = Number(aggregate.successes);
  const failedCount = requestCount - successCount;
  const successPercent = requestCount ? round(successCount / requestCount * 100) : null;
  const errorRate = requestCount ? round(failedCount / requestCount * 100) : null;
  const driftAlerts = drift.filter((item) => item.score !== null && item.score >= alertThresholds.driftScore).length;
  if (requestCount >= alertThresholds.minRequests) {
    if (aggregate.p95 !== null && aggregate.p95 > alertThresholds.p95Ms)
      await recordAlert("latency_p95", aggregate.p95, alertThresholds.p95Ms, "p95 gateway latency breached SLO", now);
    if (successPercent !== null && successPercent < alertThresholds.successPercent)
      await recordAlert("success_rate", successPercent, alertThresholds.successPercent, "Inference success rate breached SLO", now);
  }
  for (const item of drift) {
    if (item.score !== null && item.score >= alertThresholds.driftScore)
      await recordAlert(`drift_${item.versionId}`, item.score, alertThresholds.driftScore, `Input drift detected for version ${item.versionId}`, now);
  }
  await maybePruneTelemetry(now.getTime());
  const alerts = await prisma.alertEvent.findMany({ where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) } },
    orderBy: { createdAt: "desc" }, take: 20 });
  return { windowMinutes: WINDOW_MINUTES, hasData: requestCount > 0, requestCount, successCount, failedCount,
    demoRequests: Number(aggregate.demo), requestsPerSecond: round(requestCount / (WINDOW_MINUTES * 60)),
    avgLatencyMs: aggregate.average === null ? null : round(aggregate.average),
    p50LatencyMs: aggregate.p50 === null ? null : round(aggregate.p50),
    p95LatencyMs: aggregate.p95 === null ? null : round(aggregate.p95),
    p99LatencyMs: aggregate.p99 === null ? null : round(aggregate.p99),
    errorRate, modelsLive, rollingOut, driftAlerts, generatedAt: now.toISOString(),
    slo: { successPercent, targetSuccessPercent: alertThresholds.successPercent,
      targetP95Ms: alertThresholds.p95Ms, successMet: successPercent === null ? null : successPercent >= alertThresholds.successPercent,
      latencyMet: aggregate.p95 === null ? null : aggregate.p95 <= alertThresholds.p95Ms },
    runtimeHealth, drift, alerts: alerts.map((alert) => ({ id: alert.id, kind: alert.kind,
      message: alert.message, observed: alert.observed, threshold: alert.threshold, createdAt: alert.createdAt.toISOString() })),
    distribution: distributionRows.map((row) => ({ versionId: row.versionId, source: row.source, requests: row._count._all })) };
}

type BucketRow = { bucket: Date; requests: bigint; successes: bigint; latency: number | null };
type DriftBucketRow = FeatureRow & { bucket: Date };
export async function generateTimeSeries(minutes = 30, now = new Date()): Promise<TimeSeriesPoint[]> {
  const since = new Date(now.getTime() - minutes * 60_000);
  const prisma = getPrisma();
  const [rows, driftRows, references] = await Promise.all([prisma.$queryRaw<BucketRow[]>`
    SELECT date_trunc('minute', "createdAt") AS bucket,
      COUNT(*) FILTER (WHERE "status" = 'success' OR ("status" = 'failed' AND "role" = 'stable'))::bigint AS requests,
      COUNT(*) FILTER (WHERE "status" = 'success')::bigint AS successes,
      AVG(COALESCE("gatewayMs", "inferenceMs")) FILTER (WHERE "status" = 'success')::double precision AS latency
    FROM "InferenceRequest" WHERE "createdAt" >= ${since} AND "createdAt" <= ${now} AND "role" <> 'shadow'
    GROUP BY bucket ORDER BY bucket`, prisma.$queryRaw<DriftBucketRow[]>`
    SELECT date_trunc('minute', "createdAt") AS bucket, "versionId", COUNT(*) AS count,
      AVG(("features"->>'sepal_length')::double precision)::double precision AS "sepalLength",
      AVG(("features"->>'sepal_width')::double precision)::double precision AS "sepalWidth",
      AVG(("features"->>'petal_length')::double precision)::double precision AS "petalLength",
      AVG(("features"->>'petal_width')::double precision)::double precision AS "petalWidth"
    FROM "InferenceRequest" WHERE "createdAt" >= ${since} AND "createdAt" <= ${now}
      AND "status" = 'success' AND "role" <> 'shadow' AND "features" IS NOT NULL
    GROUP BY bucket, "versionId"`, prisma.featureReference.findMany()]);
  if (rows.length === 0) return [];
  const buckets = new Map(rows.map((row) => [row.bucket.getTime(), row]));
  const byVersion = new Map(references.map((reference) => [reference.versionId, reference]));
  const driftByBucket = new Map<number, number>();
  for (const row of driftRows) {
    const reference = byVersion.get(row.versionId);
    if (!reference || Number(row.count) < MIN_DRIFT_SAMPLES) continue;
    const mean = reference.mean as number[];
    const scale = reference.scale as number[];
    const observed = [row.sepalLength, row.sepalWidth, row.petalLength, row.petalWidth];
    if (mean.length !== 4 || scale.length !== 4) continue;
    const score = round(Math.max(...observed.map((value, index) => Math.abs(value - mean[index]) / scale[index])), 3);
    driftByBucket.set(row.bucket.getTime(), Math.max(driftByBucket.get(row.bucket.getTime()) ?? 0, score));
  }
  const last = Math.floor(now.getTime() / 60_000) * 60_000;
  return Array.from({ length: minutes }, (_, index) => {
    const timestamp = new Date(last - (minutes - index - 1) * 60_000);
    const row = buckets.get(timestamp.getTime());
    const count = Number(row?.requests ?? 0);
    return { timestamp: timestamp.toISOString(), label: timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      throughput: round(count / 60, 3), latency: row?.latency == null ? null : round(row.latency),
      errorRate: count ? round((count - Number(row?.successes ?? 0)) / count * 100) : null,
      driftScore: driftByBucket.get(timestamp.getTime()) ?? null };
  });
}
