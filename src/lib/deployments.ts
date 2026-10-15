import { createHash, randomUUID } from "node:crypto";
import type { Prisma, DeploymentStrategy as DbStrategy, RuntimeSlot } from "@prisma/client";
import { ApiError } from "./api-errors";
import { loadRuntimeVersion } from "./inference";
import { getPrisma } from "./prisma";
import type { Deployment, DeploymentStrategy } from "./types";
import type { z } from "zod";
import { deploymentCreateSchema } from "./validation";

const include = { family: true, targetVersion: true, stableVersion: true } as const;
type RecordWithVersions = Prisma.RegistryDeploymentGetPayload<{ include: typeof include }>;
type Tx = Prisma.TransactionClient;
const strategyToDb = (strategy: DeploymentStrategy): DbStrategy => strategy === "blue-green" ? "blue_green" : strategy;
const opposite = (slot: RuntimeSlot): RuntimeSlot => slot === "blue" ? "green" : "blue";
const lock = (tx: Tx, familyId: string) => tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${familyId}))::text`;

type Observed = NonNullable<Deployment["observed"]>;
function emptyObserved(): Observed {
  return { stable: 0, candidate: 0, shadow: 0, candidateFailures: 0, shadowFailures: 0, shadowSkipped: 0,
    candidatePercent: 0, stableLatencyMs: null, candidateLatencyMs: null };
}
export function toApiDeployment(record: RecordWithVersions, observed: Observed = emptyObserved()): Deployment {
  return { id: record.id, familyId: record.familyId, modelId: record.stableVersionId ?? record.targetVersionId,
    modelName: record.family.name, fromVersion: record.stableVersion?.version ?? "", toVersion: record.targetVersion.version,
    strategy: record.strategy === "blue_green" ? "blue-green" : record.strategy, status: record.status,
    lifecycleState: record.lifecycleState, lastError: record.lastError, trafficPercent: record.trafficPercent,
    stableSlot: record.stableSlot, candidateSlot: record.candidateSlot, observed,
    stableLatencyMs: observed.stableLatencyMs, canaryLatencyMs: observed.candidateLatencyMs,
    startedAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString() };
}
async function observedForDeployments(ids: string[]) {
  const output = new Map<string, Observed>();
  if (ids.length === 0) return output;
  const groups = await getPrisma().inferenceRequest.groupBy({
    by: ["deploymentId", "role", "status"], where: { deploymentId: { in: ids } },
    _count: { _all: true }, _avg: { gatewayMs: true, inferenceMs: true },
  });
  for (const group of groups) {
    if (!group.deploymentId) continue;
    const item = output.get(group.deploymentId) ?? emptyObserved();
    if (group.role === "stable" && group.status === "success") {
      item.stable += group._count._all;
      item.stableLatencyMs = Math.round((group._avg.gatewayMs ?? group._avg.inferenceMs ?? 0) * 100) / 100;
    }
    if (group.role === "candidate" && group.status === "success") {
      item.candidate += group._count._all;
      item.candidateLatencyMs = Math.round((group._avg.gatewayMs ?? group._avg.inferenceMs ?? 0) * 100) / 100;
    }
    if (group.role === "shadow" && group.status === "success") item.shadow += group._count._all;
    if (group.role === "candidate" && group.status === "failed") item.candidateFailures += group._count._all;
    if (group.role === "shadow" && group.status === "failed") item.shadowFailures += group._count._all;
    if (group.role === "shadow" && group.status === "skipped") item.shadowSkipped += group._count._all;
    output.set(group.deploymentId, item);
  }
  for (const item of output.values()) {
    const total = item.stable + item.candidate;
    item.candidatePercent = total ? Math.round(item.candidate / total * 1000) / 10 : 0;
  }
  return output;
}
async function event(tx: Tx, id: string, action: string, details: Prisma.InputJsonValue = {}) {
  await tx.deploymentEvent.create({ data: { deploymentId: id, action, details } });
  await tx.auditLog.create({ data: { action: `deployment.${action}`, entityType: "RegistryDeployment", entityId: id, details } });
}
async function state(tx: Tx, id: string, lifecycleState: "preparing" | "starting" | "healthy") {
  await tx.registryDeployment.update({ where: { id }, data: { lifecycleState } });
  await event(tx, id, lifecycleState);
}
export async function getDeployment(id: string) {
  const record = await getPrisma().registryDeployment.findUnique({ where: { id }, include });
  if (!record) throw new ApiError(404, "deployment_not_found", "Deployment not found.");
  const observed = await observedForDeployments([id]);
  return toApiDeployment(record, observed.get(id));
}
export async function reconcileDeployment(id: string) {
  const prisma = getPrisma();
  const initial = await prisma.registryDeployment.findUnique({ where: { id } });
  if (!initial) throw new ApiError(404, "deployment_not_found", "Deployment not found.");
  const inProgress = ["pending", "preparing", "starting", "healthy"] as const;
  if (!initial.lifecycleState || !inProgress.includes(initial.lifecycleState as typeof inProgress[number])) return getDeployment(id);
  if (!initial.stableSlot || !initial.candidateSlot) {
    await prisma.$transaction(async (tx) => {
      await lock(tx, initial.familyId);
      const current = await tx.registryDeployment.findUniqueOrThrow({ where: { id } });
      if (!current.lifecycleState || !inProgress.includes(current.lifecycleState as typeof inProgress[number])) return;
      const route = await tx.servingRoute.findUnique({ where: { familyId: current.familyId } });
      const stableSlot = current.stableSlot ?? route?.activeSlot ?? "blue";
      await tx.registryDeployment.update({ where: { id }, data: {
        stableSlot, candidateSlot: current.candidateSlot ?? opposite(stableSlot),
      } });
    });
  }
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await prisma.registryDeployment.findUniqueOrThrow({ where: { id } });
      if (current.lifecycleState === "pending") {
        await prisma.$transaction(async (tx) => {
          await lock(tx, current.familyId);
          const locked = await tx.registryDeployment.findUniqueOrThrow({ where: { id } });
          if (locked.lifecycleState === "pending") await state(tx, id, "preparing");
        });
      } else if (current.lifecycleState === "preparing") {
        await loadRuntimeVersion(current.stableVersionId!, current.stableSlot ?? "blue");
        await prisma.$transaction(async (tx) => {
          await lock(tx, current.familyId);
          const locked = await tx.registryDeployment.findUniqueOrThrow({ where: { id } });
          if (locked.lifecycleState === "preparing") await state(tx, id, "starting");
        });
      } else if (current.lifecycleState === "starting") {
        await loadRuntimeVersion(current.stableVersionId!, current.stableSlot ?? "blue");
        await loadRuntimeVersion(current.targetVersionId, current.candidateSlot ?? "green");
        await prisma.$transaction(async (tx) => {
          await lock(tx, current.familyId);
          const locked = await tx.registryDeployment.findUniqueOrThrow({ where: { id } });
          if (locked.lifecycleState === "starting") await state(tx, id, "healthy");
        });
      } else if (current.lifecycleState === "healthy") {
        // A runtime restart may have cleared its cache after this state was stored.
        await loadRuntimeVersion(current.stableVersionId!, current.stableSlot ?? "blue");
        await loadRuntimeVersion(current.targetVersionId, current.candidateSlot ?? "green");
        await prisma.$transaction(async (tx) => {
          await lock(tx, current.familyId);
          const locked = await tx.registryDeployment.findUniqueOrThrow({ where: { id } });
          if (locked.lifecycleState !== "healthy") return;
          const route = await tx.servingRoute.findUnique({ where: { familyId: locked.familyId } });
          if (route && (route.activeVersionId !== locked.stableVersionId || route.activeSlot !== (locked.stableSlot ?? "blue") || route.candidateDeploymentId)) {
            throw new ApiError(409, "route_changed", "Serving route changed during preparation.");
          }
          if (route) await tx.servingRoute.update({ where: { familyId: locked.familyId }, data: {
            candidateVersionId: locked.targetVersionId, candidateDeploymentId: id, candidateSlot: locked.candidateSlot ?? "green",
            trafficPercent: locked.trafficPercent, revision: { increment: 1 } } });
          else await tx.servingRoute.create({ data: { familyId: locked.familyId, activeVersionId: locked.stableVersionId!,
            activeSlot: locked.stableSlot ?? "blue", candidateVersionId: locked.targetVersionId,
            candidateDeploymentId: id, candidateSlot: locked.candidateSlot ?? "green", trafficPercent: locked.trafficPercent } });
          await tx.registryDeployment.update({ where: { id }, data: { lifecycleState: "active", status: "running" } });
          await event(tx, id, "active", { stableVersionId: locked.stableVersionId!, candidateVersionId: locked.targetVersionId });
          await tx.modelRuntimeState.update({ where: { versionId: locked.targetVersionId }, data: {
            status: locked.strategy === "shadow" ? "shadow" : locked.strategy === "canary" ? "canary" : "rolling",
            trafficPercent: locked.strategy === "canary" ? locked.trafficPercent : 0, lastDeployedAt: new Date() } });
          await tx.modelRuntimeState.update({ where: { versionId: locked.stableVersionId! }, data: {
            status: "live", trafficPercent: locked.strategy === "canary" ? 100 - locked.trafficPercent : 100, lastDeployedAt: new Date() } });
        });
      } else return getDeployment(id);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Runtime preparation failed.";
    await prisma.$transaction(async (tx) => {
      await lock(tx, initial.familyId);
      const current = await tx.registryDeployment.findUniqueOrThrow({ where: { id } });
      if (current.lifecycleState && inProgress.includes(current.lifecycleState as typeof inProgress[number])) {
        await tx.registryDeployment.update({ where: { id }, data: { lifecycleState: "failed", status: "failed", lastError: message } });
        await event(tx, id, "failed", { error: message });
      }
    });
    throw error;
  }
  return getDeployment(id);
}
export async function listDeployments() {
  const prisma = getPrisma();
  const stale = await prisma.registryDeployment.findMany({ where: { lifecycleState: { in: ["pending", "preparing", "starting", "healthy"] } }, select: { id: true }, take: 10 });
  for (const item of stale) { try { await reconcileDeployment(item.id); } catch { /* persisted failed state */ } }
  const records = await prisma.registryDeployment.findMany({ include, orderBy: { createdAt: "desc" } });
  const observed = await observedForDeployments(records.map((item) => item.id));
  return records.map((item) => toApiDeployment(item, observed.get(item.id)));
}
export async function createDeployment(input: z.infer<typeof deploymentCreateSchema>) {
  const prisma = getPrisma();
  const key = input.idempotencyKey ?? randomUUID();
  const hash = createHash("sha256").update(JSON.stringify({ modelId: input.modelId, fromVersion: input.fromVersion,
    toVersion: input.toVersion, strategy: input.strategy, trafficPercent: input.trafficPercent })).digest("hex");
  const prior = await prisma.registryDeployment.findUnique({ where: { idempotencyKey: key } });
  if (prior) {
    if (prior.requestHash !== hash) throw new ApiError(409, "idempotency_conflict", "Idempotency key was used for another request.");
    return prior.lifecycleState && ["pending", "preparing", "starting", "healthy"].includes(prior.lifecycleState)
      ? reconcileDeployment(prior.id) : getDeployment(prior.id);
  }
  const stable = await prisma.modelVersion.findUnique({ where: { id: input.modelId }, include: { state: true, artifact: true } });
  if (!stable) throw new ApiError(404, "model_not_found", "Selected model version not found.");
  if (input.fromVersion && input.fromVersion !== stable.version) throw new ApiError(400, "version_mismatch", "fromVersion must match the selected model version.");
  const target = await prisma.modelVersion.findUnique({ where: { familyId_version: { familyId: stable.familyId, version: input.toVersion } },
    include: { state: true, artifact: true } });
  if (!target) throw new ApiError(404, "target_not_found", "Register the target version before creating a deployment.");
  if (target.id === stable.id) throw new ApiError(409, "same_version", "Stable and target versions must differ.");
  if (stable.state?.status === "archived" || target.state?.status === "archived") throw new ApiError(409, "archived_version", "Archived versions cannot be deployed.");
  if (stable.framework !== "sklearn" || target.framework !== "sklearn" || stable.artifact?.format !== "json" || target.artifact?.format !== "json") {
    throw new ApiError(415, "unsupported_model", "Both versions require registered sklearn Iris JSON artifacts.");
  }
  const traffic = input.strategy === "blue-green" ? 0 : input.trafficPercent;
  const created = await prisma.$transaction(async (tx) => {
    await lock(tx, stable.familyId);
    const duplicate = await tx.registryDeployment.findUnique({ where: { idempotencyKey: key } });
    if (duplicate) {
      if (duplicate.requestHash !== hash) throw new ApiError(409, "idempotency_conflict", "Idempotency key was used for another request.");
      return duplicate;
    }
    const route = await tx.servingRoute.findUnique({ where: { familyId: stable.familyId } });
    if (route && route.activeVersionId !== stable.id) throw new ApiError(409, "stable_version_mismatch", "Choose the current serving version as stable.");
    if (route?.candidateDeploymentId || await tx.registryDeployment.findFirst({ where: { familyId: stable.familyId,
      lifecycleState: { in: ["pending", "preparing", "starting", "healthy"] } } })) {
      throw new ApiError(409, "deployment_conflict", "Another rollout is active for this model family.");
    }
    const stableSlot = route?.activeSlot ?? "blue";
    const candidateSlot = opposite(stableSlot);
    const deployment = await tx.registryDeployment.create({ data: { familyId: stable.familyId, stableVersionId: stable.id,
      targetVersionId: target.id, strategy: strategyToDb(input.strategy), status: "pending", lifecycleState: "pending",
      trafficPercent: traffic, idempotencyKey: key, requestHash: hash, stableSlot, candidateSlot,
      stableLatencyMs: 0, canaryLatencyMs: 0 } });
    await event(tx, deployment.id, "pending", { stableVersionId: stable.id, candidateVersionId: target.id, trafficPercent: traffic });
    return deployment;
  });
  return reconcileDeployment(created.id);
}
export async function updateDeploymentTraffic(id: string, trafficPercent: number) {
  const prisma = getPrisma();
  const initial = await prisma.registryDeployment.findUnique({ where: { id } });
  if (!initial) throw new ApiError(404, "deployment_not_found", "Deployment not found.");
  await prisma.$transaction(async (tx) => {
    await lock(tx, initial.familyId);
    const current = await tx.registryDeployment.findUniqueOrThrow({ where: { id } });
    if (current.lifecycleState !== "active" || current.status !== "running") throw new ApiError(409, "deployment_finished", "Only active rollouts can change traffic.");
    const route = await tx.servingRoute.findUnique({ where: { familyId: current.familyId } });
    if (route?.candidateDeploymentId !== id) throw new ApiError(409, "route_changed", "This deployment is not the serving candidate.");
    if (current.strategy === "blue_green") throw new ApiError(409, "strategy_conflict", "Blue-green routing switches only on promotion.");
    const next = trafficPercent;
    await tx.servingRoute.update({ where: { familyId: current.familyId }, data: { trafficPercent: next, revision: { increment: 1 } } });
    await tx.registryDeployment.update({ where: { id }, data: { trafficPercent: next } });
    await tx.modelRuntimeState.update({ where: { versionId: current.targetVersionId }, data: { trafficPercent: current.strategy === "shadow" ? 0 : next } });
    await tx.modelRuntimeState.update({ where: { versionId: current.stableVersionId! }, data: { trafficPercent: current.strategy === "shadow" ? 100 : 100 - next } });
    await event(tx, id, "traffic_changed", { trafficPercent: next });
  });
  return getDeployment(id);
}
export async function finishDeployment(id: string, action: "promote" | "rollback") {
  const prisma = getPrisma();
  const initial = await prisma.registryDeployment.findUnique({ where: { id } });
  if (!initial) throw new ApiError(404, "deployment_not_found", "Deployment not found.");
  await prisma.$transaction(async (tx) => {
    await lock(tx, initial.familyId);
    const current = await tx.registryDeployment.findUniqueOrThrow({ where: { id } });
    if (action === "promote" && current.status === "completed") return;
    if (action === "rollback" && current.status === "rolled_back") return;
    const route = await tx.servingRoute.findUnique({ where: { familyId: current.familyId } });
    const afterPromotion = action === "rollback" && current.status === "completed" &&
      route?.activeVersionId === current.targetVersionId && route.activeSlot === current.candidateSlot &&
      route.revision === current.promotedRouteRevision && !route.candidateDeploymentId;
    if (!afterPromotion && (current.status !== "running" || current.lifecycleState !== "active" || route?.candidateDeploymentId !== id)) {
      throw new ApiError(409, "deployment_finished", "Deployment is not the active serving rollout.");
    }
    const nextVersionId = action === "promote" ? current.targetVersionId : current.stableVersionId!;
    const nextSlot = action === "promote" ? current.candidateSlot : current.stableSlot;
    if (!nextSlot) throw new ApiError(409, "legacy_deployment", "This deployment predates separate runtime slots.");
    await loadRuntimeVersion(nextVersionId, nextSlot);
    await tx.servingRoute.update({ where: { familyId: current.familyId }, data: {
      activeVersionId: nextVersionId, activeSlot: nextSlot, candidateVersionId: null, candidateDeploymentId: null, candidateSlot: null,
      trafficPercent: 0, revision: { increment: 1 } } });
    await tx.registryDeployment.update({ where: { id }, data: { status: action === "promote" ? "completed" : "rolled_back",
      lifecycleState: action === "promote" ? "active" : "terminated", trafficPercent: action === "promote" ? 100 : 0,
      promotedRouteRevision: action === "promote" ? route!.revision + 1 : current.promotedRouteRevision } });
    await tx.modelRuntimeState.update({ where: { versionId: current.targetVersionId }, data: {
      status: action === "promote" ? "live" : "shadow", trafficPercent: action === "promote" ? 100 : 0, lastDeployedAt: new Date() } });
    await tx.modelRuntimeState.update({ where: { versionId: current.stableVersionId! }, data: {
      status: action === "promote" ? "shadow" : "live", trafficPercent: action === "promote" ? 0 : 100, lastDeployedAt: new Date() } });
    await event(tx, id, action, { servingVersionId: nextVersionId, servingSlot: nextSlot });
  }, { timeout: 30000 });
  return getDeployment(id);
}

export async function retryDeployment(id: string) {
  const prisma = getPrisma();
  const initial = await prisma.registryDeployment.findUnique({ where: { id } });
  if (!initial) throw new ApiError(404, "deployment_not_found", "Deployment not found.");
  await prisma.$transaction(async (tx) => {
    await lock(tx, initial.familyId);
    const current = await tx.registryDeployment.findUniqueOrThrow({ where: { id } });
    if (current.lifecycleState !== "failed") throw new ApiError(409, "not_failed", "Only failed deployments can be retried.");
    const route = await tx.servingRoute.findUnique({ where: { familyId: current.familyId } });
    if (route && (route.activeVersionId !== current.stableVersionId || route.activeSlot !== current.stableSlot || route.candidateDeploymentId)) {
      throw new ApiError(409, "route_changed", "Serving route changed; create a new rollout.");
    }
    await tx.registryDeployment.update({ where: { id }, data: { lifecycleState: "pending", status: "pending", lastError: null } });
    await event(tx, id, "retry");
  });
  return reconcileDeployment(id);
}
