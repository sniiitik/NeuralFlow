import { createHash, randomUUID } from "node:crypto";
import type { Prisma, RuntimeSlot } from "@prisma/client";
import { ApiError } from "./api-errors";
import { retrieveArtifact } from "./artifact-storage";
import { getPrisma } from "./prisma";
import { maybePruneTelemetry } from "./telemetry-retention";
import type { z } from "zod";
import type { inferenceInputSchema } from "./validation";

type ArtifactPayload = { version_id: string; version: string; sha256: string; artifact_base64: string };

export function runtimeHeaders() {
  const token = process.env.INFERENCE_RUNTIME_TOKEN;
  if (!token || token.length < 32) throw new ApiError(503, "runtime_credential_missing", "Inference runtime credential is not configured.");
  return { "X-NeuralFlow-Runtime-Token": token };
}

function runtimeUrl(slot: RuntimeSlot = "blue") {
  const url = slot === "blue"
    ? process.env.INFERENCE_RUNTIME_URL ?? "http://127.0.0.1:8001"
    : process.env.INFERENCE_RUNTIME_GREEN_URL ?? "http://127.0.0.1:8002";
  return url.replace(/\/$/, "");
}

async function runtimePost(path: string, payload: object, requestId: string, slot: RuntimeSlot = "blue", timeoutMs = 10_000): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${runtimeUrl(slot)}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": requestId, ...runtimeHeaders() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ApiError(504, "runtime_timeout", "Inference runtime timed out.");
    }
    throw new ApiError(503, "runtime_unavailable", "Inference runtime is unavailable.");
  }
  let result: unknown;
  try { result = await response.json(); } catch { throw new ApiError(502, "runtime_response", "Inference runtime returned invalid JSON."); }
  if (!response.ok) {
    const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
      ? result.error : "Inference runtime rejected the request.";
    throw new ApiError(response.status === 422 ? 422 : 502, "runtime_rejected", message);
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new ApiError(502, "runtime_response", "Invalid inference runtime response.");
  return result as Record<string, unknown>;
}

export async function artifactForVersion(versionId: string): Promise<ArtifactPayload> {
  const version = await getPrisma().modelVersion.findUnique({ where: { id: versionId }, include: { artifact: true, state: true } });
  if (!version) throw new ApiError(404, "model_not_found", "Model version not found.");
  if (version.state?.status === "archived") throw new ApiError(409, "archived_version", "Archived versions cannot serve predictions.");
  if (version.framework !== "sklearn" || version.artifact?.format !== "json") {
    throw new ApiError(415, "unsupported_model", "Inference currently supports sklearn Iris JSON artifacts only.");
  }
  const bytes = await retrieveArtifact(version.artifact.storageKey, version.artifact.sha256);
  if (bytes.length > 1024 * 1024) throw new ApiError(415, "unsupported_model", "Inference JSON artifact exceeds 1 MiB.");
  return { version_id: version.id, version: version.version, sha256: version.artifact.sha256, artifact_base64: bytes.toString("base64") };
}

export async function loadRuntimeVersion(versionId: string, slot: RuntimeSlot = "blue"): Promise<void> {
  const artifact = await artifactForVersion(versionId);
  const loaded = await runtimePost("/v1/models/load", artifact, randomUUID(), slot);
  if (loaded.version_id !== versionId || loaded.version !== artifact.version) {
    throw new ApiError(502, "runtime_version", "Inference runtime loaded an unexpected version.");
  }
  let response: Response;
  try {
    response = await fetch(`${runtimeUrl(slot)}/v1/models/${encodeURIComponent(versionId)}/readyz?sha256=${artifact.sha256}`, {
      headers: runtimeHeaders(),
      signal: AbortSignal.timeout(5_000), cache: "no-store",
    });
  } catch { throw new ApiError(503, "runtime_unavailable", "Inference runtime readiness check failed."); }
  if (!response.ok) throw new ApiError(503, "runtime_not_ready", "Model version is not ready in the inference runtime.");
  const ready = await response.json() as Record<string, unknown>;
  if (ready.version_id !== versionId || ready.sha256 !== artifact.sha256 || ready.status !== "ready") {
    throw new ApiError(502, "runtime_readiness", "Inference runtime reported an unexpected model version.");
  }
}

export async function listInferenceDeployments() {
  const routes = await getPrisma().servingRoute.findMany({ include: { family: true, activeVersion: true } });
  const records = await getPrisma().registryDeployment.findMany({
    where: { status: { in: ["running", "completed"] }, events: { some: { action: "inference_activated" } },
      targetVersion: { framework: "sklearn", artifact: { is: { format: "json" } }, state: { is: { status: { not: "archived" } } } } },
    include: { family: true, targetVersion: true }, orderBy: { createdAt: "desc" },
  });
  return [
    ...routes.map((route) => ({ id: route.familyId, familyId: route.familyId, modelName: route.family.name,
      version: route.activeVersion.version, versionId: route.activeVersionId, status: "serving" })),
    ...records.map((record) => ({ id: record.id, modelName: record.family.name, version: record.targetVersion.version,
      versionId: record.targetVersionId, status: record.status })),
  ];
}

export async function activateInferenceVersion(versionId: string) {
  const artifact = await artifactForVersion(versionId);
  const requestId = randomUUID();
  const loaded = await runtimePost("/v1/models/load", artifact, requestId);
  if (loaded.version_id !== versionId || loaded.version !== artifact.version) {
    throw new ApiError(502, "runtime_version", "Inference runtime loaded an unexpected version.");
  }
  const prisma = getPrisma();
  const version = await prisma.modelVersion.findUniqueOrThrow({ where: { id: versionId } });
  const existing = await prisma.registryDeployment.findFirst({ where: { targetVersionId: versionId, status: "completed",
    stableVersionId: null, events: { some: { action: "inference_activated" } } } });
  if (existing) return { deploymentId: existing.id, versionId, version: version.version };
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${version.familyId}))::text`;
    if (await tx.registryDeployment.findFirst({ where: { familyId: version.familyId,
      lifecycleState: { in: ["pending", "preparing", "starting", "healthy"] } } })) {
      throw new ApiError(409, "deployment_conflict", "A rollout is being prepared for this model family.");
    }
    const currentRoute = await tx.servingRoute.findUnique({ where: { familyId: version.familyId } });
    const deployment = await tx.registryDeployment.create({ data: {
      familyId: version.familyId, targetVersionId: versionId, strategy: "blue_green", status: "completed", trafficPercent: 100,
      events: { create: { action: "inference_activated", details: { artifactSha256: artifact.sha256 } } },
    } });
    await tx.modelRuntimeState.update({ where: { versionId }, data: {
      status: !currentRoute || currentRoute.activeVersionId === versionId ? "live" : "shadow",
      trafficPercent: !currentRoute || currentRoute.activeVersionId === versionId ? 100 : 0,
      lastDeployedAt: new Date(),
    } });
    await tx.servingRoute.upsert({ where: { familyId: version.familyId }, create: { familyId: version.familyId, activeVersionId: versionId }, update: {} });
    await tx.auditLog.create({ data: { action: "inference.activate", entityType: "RegistryDeployment", entityId: deployment.id,
      details: { versionId, artifactSha256: artifact.sha256 } } });
    return { deploymentId: deployment.id, versionId, version: version.version };
  });
}

export async function predict(deploymentId: string, features: z.infer<typeof inferenceInputSchema>["features"], suppliedRequestId?: string | null, source = "user") {
  const started = performance.now();
  const deployment = await getPrisma().registryDeployment.findUnique({ where: { id: deploymentId },
    include: { events: { where: { action: "inference_activated" }, take: 1 } } });
  if (!deployment || !["running", "completed"].includes(deployment.status) || deployment.events.length === 0) {
    throw new ApiError(404, "deployment_not_available", "An active deployment is required for inference.");
  }
  const artifact = await artifactForVersion(deployment.targetVersionId);
  const requestId = suppliedRequestId && /^[a-zA-Z0-9._-]{1,128}$/.test(suppliedRequestId) ? suppliedRequestId : randomUUID();
  let result: Record<string, unknown>;
  try {
    result = await runtimePost("/v1/predict", { ...artifact, features }, requestId);
  } catch (error) {
    try {
      await recordAttempt({ requestId, familyId: deployment.familyId, deploymentId, versionId: deployment.targetVersionId,
        slot: "blue", role: "stable", status: "failed", features, source, gatewayMs: performance.now() - started,
        errorCode: error instanceof ApiError ? error.code : "runtime_error" });
    } catch { /* preserve the runtime error if telemetry is unavailable */ }
    throw error;
  }
  if (result.version_id !== artifact.version_id || result.version !== artifact.version ||
      typeof result.prediction !== "string" || typeof result.inference_ms !== "number" ||
      !result.probabilities || typeof result.probabilities !== "object") {
    await recordAttempt({ requestId, familyId: deployment.familyId, deploymentId, versionId: deployment.targetVersionId,
      slot: "blue", role: "stable", status: "failed", features, source, gatewayMs: performance.now() - started,
      errorCode: "runtime_response" });
    throw new ApiError(502, "runtime_response", "Inference runtime returned an invalid prediction response.");
  }
  await recordAttempt({ requestId, familyId: deployment.familyId, deploymentId, versionId: deployment.targetVersionId,
    slot: "blue", role: "stable", status: "success", features, source, gatewayMs: performance.now() - started,
    result: { versionId: artifact.version_id, version: artifact.version, prediction: result.prediction,
      probabilities: result.probabilities as Record<string, number>, inferenceMs: result.inference_ms } });
  return { requestId, deploymentId, modelVersionId: artifact.version_id, modelVersion: artifact.version,
    prediction: result.prediction, probabilities: result.probabilities, inferenceMs: result.inference_ms };
}

type Features = z.infer<typeof inferenceInputSchema>["features"];
type RuntimePrediction = { versionId: string; version: string; prediction: string; probabilities: Record<string, number>; inferenceMs: number };
const MAX_SHADOW_IN_FLIGHT = 8;
const SHADOW_TIMEOUT_MS = 750;
let shadowInFlight = 0;

async function runtimeHealth(slot: RuntimeSlot, timeoutMs: number) {
  let response: Response;
  try {
    response = await fetch(`${runtimeUrl(slot)}/healthz`, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch { throw new ApiError(503, "runtime_unavailable", `${slot} inference runtime is unavailable.`); }
  if (!response.ok) throw new ApiError(503, "runtime_unhealthy", `${slot} inference runtime is unhealthy.`);
  const body = await response.json() as Record<string, unknown>;
  if (body.status !== "ok") throw new ApiError(503, "runtime_unhealthy", `${slot} inference runtime is unhealthy.`);
}

async function predictAtSlot(versionId: string, slot: RuntimeSlot, features: Features, requestId: string, timeoutMs = 10_000): Promise<RuntimePrediction> {
  const artifact = await artifactForVersion(versionId);
  await runtimeHealth(slot, Math.min(timeoutMs, 1_000));
  const result = await runtimePost("/v1/predict", { ...artifact, features }, requestId, slot, timeoutMs);
  if (result.version_id !== versionId || result.version !== artifact.version || typeof result.prediction !== "string" ||
      typeof result.inference_ms !== "number" || !result.probabilities || typeof result.probabilities !== "object" ||
      Array.isArray(result.probabilities)) {
    throw new ApiError(502, "runtime_response", "Inference runtime returned an invalid prediction response.");
  }
  return { versionId, version: artifact.version, prediction: result.prediction,
    probabilities: result.probabilities as Record<string, number>, inferenceMs: result.inference_ms };
}

async function recordAttempt(input: {
  requestId: string; familyId: string; deploymentId: string | null; versionId: string; slot: RuntimeSlot;
  role: "stable" | "candidate" | "shadow"; status: "success" | "failed" | "skipped";
  result?: RuntimePrediction; errorCode?: string;
  features?: Features; gatewayMs?: number; source?: string;
}) {
  await getPrisma().inferenceRequest.create({ data: {
    requestId: input.requestId, familyId: input.familyId, deploymentId: input.deploymentId,
    versionId: input.versionId, slot: input.slot, role: input.role, status: input.status,
    inferenceMs: input.result?.inferenceMs, prediction: input.result?.prediction,
    gatewayMs: input.gatewayMs, features: input.features as Prisma.InputJsonValue | undefined,
    source: input.source === "demo" ? "demo" : "user",
    probabilities: input.result?.probabilities as Prisma.InputJsonValue | undefined,
    errorCode: input.errorCode,
  } });
  if (input.status === "success" && input.role !== "shadow") {
    await ensureFeatureReference(input.versionId);
  }
  void maybePruneTelemetry();
}

async function ensureFeatureReference(versionId: string) {
  const prisma = getPrisma();
  if (await prisma.featureReference.findUnique({ where: { versionId } })) return;
  const version = await prisma.modelVersion.findUnique({ where: { id: versionId }, include: { artifact: true } });
  if (!version?.artifact || version.framework !== "sklearn" || version.artifact.format !== "json") return;
  const bytes = await retrieveArtifact(version.artifact.storageKey, version.artifact.sha256);
  const payload = JSON.parse(bytes.toString("utf8")) as { model?: { type?: string; mean?: unknown; scale?: unknown } };
  const mean = payload.model?.mean;
  const scale = payload.model?.scale;
  if (payload.model?.type !== "sklearn_iris_logistic_regression" || !Array.isArray(mean) || !Array.isArray(scale) ||
      mean.length !== 4 || scale.length !== 4 || !mean.every((x) => typeof x === "number" && Number.isFinite(x)) ||
      !scale.every((x) => typeof x === "number" && Number.isFinite(x) && x > 0)) return;
  await prisma.featureReference.upsert({ where: { versionId }, update: {}, create: {
    versionId, mean, scale, sampleCount: 112, source: "iris_train_split_scaler_2026_42",
  } });
}

async function mirrorShadow(input: { requestId: string; familyId: string; deploymentId: string; versionId: string; slot: RuntimeSlot; features: Features }) {
  const attempt = { requestId: input.requestId, familyId: input.familyId, deploymentId: input.deploymentId,
    versionId: input.versionId, slot: input.slot, role: "shadow" as const };
  if (shadowInFlight >= MAX_SHADOW_IN_FLIGHT) {
    try { await recordAttempt({ ...attempt, status: "skipped", errorCode: "shadow_capacity" }); } catch { /* primary response remains valid */ }
    return;
  }
  shadowInFlight++;
  try {
    const result = await predictAtSlot(input.versionId, input.slot, input.features, input.requestId, SHADOW_TIMEOUT_MS);
    await recordAttempt({ ...attempt, status: "success", result });
  } catch (error) {
    try { await recordAttempt({ ...attempt, status: "failed", errorCode: error instanceof ApiError ? error.code : "shadow_error" }); }
    catch { /* shadow telemetry cannot affect the primary response */ }
  } finally {
    shadowInFlight--;
  }
}

export async function predictFamily(familyId: string, features: Features, suppliedRequestId?: string | null, source = "user") {
  const started = performance.now();
  const route = await getPrisma().servingRoute.findUnique({ where: { familyId }, include: { candidateDeployment: true } });
  if (!route) throw new ApiError(404, "route_not_found", "This model family has no active serving route.");
  const requestId = suppliedRequestId && /^[a-zA-Z0-9._-]{1,128}$/.test(suppliedRequestId) ? suppliedRequestId : randomUUID();
  const bucket = createHash("sha256").update(requestId).digest().readUInt32BE(0) / 4294967296 * 100;
  const strategy = route.candidateDeployment?.strategy;
  const selected = Boolean(strategy === "canary" && route.candidateVersionId && bucket < route.trafficPercent);
  const primaryVersionId = selected ? route.candidateVersionId! : route.activeVersionId;
  const primarySlot = selected ? route.candidateSlot! : route.activeSlot;
  let role: "stable" | "candidate" = selected ? "candidate" : "stable";
  let fallbackFromCandidate = false;
  let result: RuntimePrediction;
  try {
    result = await predictAtSlot(primaryVersionId, primarySlot, features, requestId);
  } catch (error) {
    if (!selected) {
      try {
        await recordAttempt({ requestId, familyId, deploymentId: route.candidateDeploymentId,
          versionId: primaryVersionId, slot: primarySlot, role: "stable", status: "failed",
          features, source, gatewayMs: performance.now() - started,
          errorCode: error instanceof ApiError ? error.code : "stable_error" });
      } catch { /* retain the inference error */ }
      throw error;
    }
    try {
      await recordAttempt({ requestId, familyId, deploymentId: route.candidateDeploymentId,
        versionId: primaryVersionId, slot: primarySlot, role: "candidate", status: "failed",
        features, source, gatewayMs: performance.now() - started,
        errorCode: error instanceof ApiError ? error.code : "candidate_error" });
    } catch { /* attempt the healthy stable runtime even if telemetry is unavailable */ }
    try {
      result = await predictAtSlot(route.activeVersionId, route.activeSlot, features, requestId);
    } catch (stableError) {
      try {
        await recordAttempt({ requestId, familyId, deploymentId: route.candidateDeploymentId,
          versionId: route.activeVersionId, slot: route.activeSlot, role: "stable", status: "failed",
          features, source, gatewayMs: performance.now() - started,
          errorCode: stableError instanceof ApiError ? stableError.code : "stable_error" });
      } catch { /* retain the inference error */ }
      throw stableError;
    }
    role = "stable";
    fallbackFromCandidate = true;
  }
  await recordAttempt({ requestId, familyId, deploymentId: route.candidateDeploymentId,
    versionId: result.versionId, slot: role === "candidate" ? primarySlot : route.activeSlot,
    role, status: "success", result, features, source, gatewayMs: performance.now() - started });
  if (strategy === "shadow" && route.candidateVersionId && route.candidateSlot && route.candidateDeploymentId && bucket < route.trafficPercent) {
    await mirrorShadow({ requestId, familyId, deploymentId: route.candidateDeploymentId,
      versionId: route.candidateVersionId, slot: route.candidateSlot, features });
  }
  return { requestId, familyId, deploymentId: role === "candidate" ? route.candidateDeploymentId : null,
    modelVersionId: result.versionId, modelVersion: result.version, prediction: result.prediction,
    probabilities: result.probabilities, inferenceMs: result.inferenceMs,
    servingRole: role, servingSlot: role === "candidate" ? route.candidateSlot : route.activeSlot,
    fallbackFromCandidate, routeRevision: route.revision };
}
