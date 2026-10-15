import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.slice(1).endsWith("_test")) {
  throw new Error("Set TEST_DATABASE_URL to an isolated database whose name ends in _test.");
}
process.env.DATABASE_URL = testUrl;
process.env.ARTIFACT_STORAGE_DIR = await mkdtemp(path.join(tmpdir(), "neuralflow-monitor-artifacts-"));
const { getPrisma } = await import("../src/lib/prisma");
const { generateSnapshot, generateTimeSeries, getDrift } = await import("../src/lib/metrics");
const { GET: snapshotApi } = await import("../src/app/api/metrics/snapshot/route");
const { GET: seriesApi } = await import("../src/app/api/metrics/timeseries/route");
const { maybePruneTelemetry } = await import("../src/lib/telemetry-retention");
const { POST: registerModel } = await import("../src/app/api/models/route");
const { POST: activateModel } = await import("../src/app/api/inference/deployments/route");
const { POST: predictApi } = await import("../src/app/api/inference/predict/route");

test("monitoring reflects persisted inference events", async (t) => {
  const prisma = getPrisma();
  const unique = randomUUID();
  const family = await prisma.modelFamily.create({ data: { name: `monitor-${unique}`, owner: "test" } });
  const version = await prisma.modelVersion.create({ data: { familyId: family.id, version: "v1", framework: "sklearn" } });
  await prisma.featureReference.create({ data: { versionId: version.id, mean: [5, 3, 1.5, 0.2],
    scale: [1, 1, 1, 1], sampleCount: 112, source: "test_reference" } });
  const latest = await prisma.inferenceRequest.aggregate({ _max: { createdAt: true } });
  const now = new Date(Math.max(Date.now() + 60 * 60_000,
    (latest._max.createdAt?.getTime() ?? 0) + 10 * 60_000));
  const createdAt = new Date(now.getTime() - 60_000);
  const features = { sepal_length: 6, sepal_width: 3, petal_length: 1.5, petal_width: 0.2 };
  const base = { familyId: family.id, versionId: version.id, slot: "blue" as const, createdAt, features,
    deploymentId: null, source: "demo" };

  await t.test("empty windows have no fabricated values", async () => {
    const empty = await generateSnapshot(new Date("2000-01-01T00:00:00.000Z"));
    assert.equal(empty.requestCount, 0);
    assert.equal(empty.p95LatencyMs, null);
    assert.equal(empty.errorRate, null);
  });

  await prisma.inferenceRequest.createMany({ data: Array.from({ length: 30 }, (_, index) => ({
    ...base, id: randomUUID(), requestId: `${unique}-${index}`, role: "stable" as const, status: "success" as const,
    gatewayMs: 120, inferenceMs: 10, prediction: "setosa",
  })) });
  await prisma.inferenceRequest.create({ data: { ...base, id: randomUUID(), requestId: `${unique}-failed`,
    role: "stable", status: "failed", gatewayMs: 150, errorCode: "runtime_unavailable" } });
  await prisma.inferenceRequest.create({ data: { ...base, id: randomUUID(), requestId: `${unique}-0`,
    role: "candidate", status: "failed", gatewayMs: 15, errorCode: "candidate_timeout" } });
  await prisma.inferenceRequest.create({ data: { ...base, id: randomUUID(), requestId: `${unique}-0`,
    role: "stable", status: "success", gatewayMs: 120, inferenceMs: 10, prediction: "setosa" } });

  await t.test("counts terminal requests despite reused IDs and computes exact percentiles and SLOs", async () => {
    const snapshot = await generateSnapshot(now);
    assert.equal(snapshot.requestCount, 32);
    assert.equal(snapshot.successCount, 31);
    assert.equal(snapshot.failedCount, 1);
    assert.equal(snapshot.demoRequests, 32);
    assert.equal(snapshot.p50LatencyMs, 120);
    assert.equal(snapshot.p95LatencyMs, 120);
    assert.equal(snapshot.p99LatencyMs, 120);
    assert.equal(snapshot.errorRate, 3.13);
    assert.equal(snapshot.slo.successMet, false);
    assert.equal(snapshot.slo.latencyMet, false);
    assert.equal(snapshot.distribution.find((item) => item.versionId === version.id)?.requests, 31);
  });

  await t.test("calculates drift only with enough real feature samples", async () => {
    const drift = await getDrift(new Date(now.getTime() - 60 * 60_000));
    assert.equal(drift.find((item) => item.versionId === version.id)?.score, 1);
    const series = await generateTimeSeries(30, now);
    assert.equal(series.length, 30);
    assert.ok(series.some((point) => point.driftScore === 1 && point.latency === 120));
  });

  await t.test("persists threshold alerts and health probes", async () => {
    const alerts = await prisma.alertEvent.findMany({ where: { kind: { in: ["latency_p95", "success_rate", `drift_${version.id}`] },
      windowStart: new Date(Math.floor(now.getTime() / 300_000) * 300_000) } });
    assert.deepEqual(new Set(alerts.map((alert) => alert.kind)),
      new Set(["latency_p95", "success_rate", `drift_${version.id}`]));
    assert.equal(await prisma.runtimeHealthSample.count({ where: { bucketAt: new Date(Math.floor(now.getTime() / 60_000) * 60_000) } }), 2);
  });

  await t.test("runtime failure creates a persistent health alert", async () => {
    const previous = process.env.INFERENCE_RUNTIME_GREEN_URL;
    process.env.INFERENCE_RUNTIME_GREEN_URL = "http://127.0.0.1:1";
    const checkAt = new Date(now.getTime() + 20 * 60_000);
    try {
      const snapshot = await generateSnapshot(checkAt);
      assert.equal(snapshot.runtimeHealth.find((item) => item.slot === "green")?.healthy, false);
      assert.equal(await prisma.alertEvent.count({ where: { kind: "runtime_green",
        windowStart: new Date(Math.floor(checkAt.getTime() / 300_000) * 300_000) } }), 1);
    } finally {
      if (previous === undefined) delete process.env.INFERENCE_RUNTIME_GREEN_URL;
      else process.env.INFERENCE_RUNTIME_GREEN_URL = previous;
    }
  });

  await t.test("telemetry endpoints return persisted shapes and validate windows", async () => {
    const response = await snapshotApi();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(typeof body.requestCount, "number");
    const seriesResponse = await seriesApi(new Request("http://test/api/metrics/timeseries?minutes=15"));
    assert.equal(seriesResponse.status, 200);
    assert.ok(Array.isArray((await seriesResponse.json()).series));
  });

  await t.test("records remain readable after a new Prisma client connection", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const independent = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
    try { assert.equal(await independent.inferenceRequest.count({ where: { familyId: family.id } }), 33); }
    finally { await independent.$disconnect(); }
  });

  await t.test("a genuine gateway prediction changes recorded monitoring", async () => {
    const form = new FormData();
    form.set("name", `monitor-live-${randomUUID()}`);
    form.set("version", "v1");
    form.set("framework", "sklearn");
    form.set("owner", "monitoring-test");
    form.set("artifact", new File([await readFile("inference/examples/iris-v1.json")], "iris-v1.json", { type: "application/json" }));
    const registered = await registerModel(new Request("http://test/api/models", { method: "POST", body: form }));
    assert.equal(registered.status, 201);
    const model = (await registered.json()).model;
    const activated = await activateModel(new Request("http://test/api/inference/deployments", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ versionId: model.id }),
    }));
    assert.equal(activated.status, 201);
    const before = await prisma.inferenceRequest.count({ where: { versionId: model.id } });
    const predicted = await predictApi(new Request("http://test/api/inference/predict", {
      method: "POST", headers: { "content-type": "application/json", "x-neuralflow-traffic-source": "demo" },
      body: JSON.stringify({ familyId: model.familyId, features: {
        sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2,
      } }),
    }));
    assert.equal(predicted.status, 200);
    assert.equal((await predicted.json()).modelVersionId, model.id);
    assert.equal(await prisma.inferenceRequest.count({ where: { versionId: model.id } }), before + 1);
    const recorded = await prisma.inferenceRequest.findFirstOrThrow({ where: { versionId: model.id }, orderBy: { createdAt: "desc" } });
    assert.equal(recorded.source, "user"); // Caller-supplied demo header is untrusted.
    assert.ok(recorded.gatewayMs && recorded.gatewayMs > 0);
    assert.deepEqual(recorded.features, { sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2 });
    assert.ok((await generateSnapshot()).distribution.some((row) => row.versionId === model.id && row.source === "user"));
  });

  await t.test("retention removes only expired telemetry", async () => {
    const old = new Date(now.getTime() - 91 * 86_400_000);
    const oldRequest = randomUUID();
    const oldHealth = randomUUID();
    const oldAlert = randomUUID();
    await prisma.inferenceRequest.create({ data: { ...base, id: oldRequest, requestId: oldRequest,
      role: "stable", status: "success", createdAt: old } });
    await prisma.runtimeHealthSample.create({ data: { id: oldHealth, slot: "blue", healthy: true,
      bucketAt: old, createdAt: old } });
    await prisma.alertEvent.create({ data: { id: oldAlert, fingerprint: oldAlert, kind: "old_test",
      severity: "warning", message: "expired", observed: 1, threshold: 0.5, windowStart: old, createdAt: old } });
    await maybePruneTelemetry(now.getTime() + 2 * 60 * 60_000);
    assert.equal(await prisma.inferenceRequest.count({ where: { id: oldRequest } }), 0);
    assert.equal(await prisma.runtimeHealthSample.count({ where: { id: oldHealth } }), 0);
    assert.equal(await prisma.alertEvent.count({ where: { id: oldAlert } }), 0);
    assert.equal(await prisma.modelVersion.count({ where: { id: version.id } }), 1);
  });
});
