import type { Prisma } from "@prisma/client";
import { ApiError } from "./api-errors";
import type { ValidatedArtifact } from "./artifact-storage";
import { storeArtifact } from "./artifact-storage";
import { getPrisma } from "./prisma";
import { getDrift } from "./metrics";
import type { MLModel, ModelStatus } from "./types";
import { registerModelSchema } from "./validation";
import type { z } from "zod";

export const versionInclude = { family: true, state: true, artifact: true } as const;
export type VersionRecord = Prisma.ModelVersionGetPayload<{ include: typeof versionInclude }>;

export function toApiModel(record: VersionRecord): MLModel {
  const state = record.state;
  const artifact = record.artifact;
  return {
    id: record.id,
    familyId: record.familyId,
    name: record.family.name,
    version: record.version,
    framework: record.framework as MLModel["framework"],
    status: (state?.status ?? "shadow") as ModelStatus,
    owner: record.family.owner,
    description: record.description,
    runtime: record.runtime,
    replicas: record.replicas,
    artifactName: artifact?.originalName ?? record.legacyArtifactName ?? undefined,
    artifactSizeKb: artifact ? Math.max(1, Math.ceil(artifact.byteSize / 1024)) : record.legacyArtifactSizeKb ?? undefined,
    artifactAvailable: Boolean(artifact),
    artifactSha256: artifact?.sha256,
    trafficPercent: state?.trafficPercent ?? 0,
    requestsPerSecond: 0,
    avgLatencyMs: null,
    errorRate: null,
    driftScore: null,
    createdAt: record.createdAt.toISOString(),
    lastDeployedAt: (state?.lastDeployedAt ?? record.createdAt).toISOString(),
  };
}

export async function listModels() {
  const records = await getPrisma().modelVersion.findMany({ include: versionInclude, orderBy: { createdAt: "desc" } });
  const models = records.map(toApiModel);
  const since = new Date(Date.now() - 5 * 60_000);
  const [metrics, drift] = await Promise.all([
    getPrisma().$queryRaw<Array<{ versionId: string; requests: bigint; successes: bigint; latency: number | null }>>`
      SELECT "versionId", COUNT(*) FILTER (WHERE "status" = 'success' OR ("status" = 'failed' AND "role" = 'stable'))::bigint AS requests,
        COUNT(*) FILTER (WHERE "status" = 'success')::bigint AS successes,
        AVG(COALESCE("gatewayMs", "inferenceMs")) FILTER (WHERE "status" = 'success')::double precision AS latency
      FROM "InferenceRequest" WHERE "createdAt" >= ${since} AND "role" <> 'shadow'
      GROUP BY "versionId"`,
    getDrift(),
  ]);
  const metricByVersion = new Map(metrics.map((row) => [row.versionId, row]));
  const driftByVersion = new Map(drift.map((row) => [row.versionId, row]));
  return models.map((model) => {
    const metric = metricByVersion.get(model.id);
    const requests = Number(metric?.requests ?? 0);
    return { ...model, requestsPerSecond: Math.round(requests / 300 * 1000) / 1000,
      avgLatencyMs: metric?.latency == null ? null : Math.round(metric.latency * 100) / 100,
      errorRate: requests ? Math.round((requests - Number(metric?.successes ?? 0)) / requests * 10000) / 100 : null,
      driftScore: driftByVersion.get(model.id)?.score ?? null };
  });
}

export async function getModel(id: string) {
  const record = await getPrisma().modelVersion.findUnique({ where: { id }, include: versionInclude });
  if (!record) throw new ApiError(404, "model_not_found", "Model version not found.");
  return (await listModels()).find((model) => model.id === id)!;
}

export async function createModel(input: z.infer<typeof registerModelSchema>, artifact?: ValidatedArtifact) {
  if (artifact) await storeArtifact(artifact);
  const record = await getPrisma().$transaction(async (tx) => {
    const family = await tx.modelFamily.upsert({
      where: { name: input.name },
      create: { name: input.name, owner: input.owner, description: input.description },
      update: {},
    });
    const version = await tx.modelVersion.create({
      data: {
        familyId: family.id,
        version: input.version,
        framework: input.framework,
        description: input.description,
        runtime: input.runtime,
        replicas: input.replicas,
        state: { create: { status: input.status } },
        ...(artifact ? { artifact: { create: {
          originalName: artifact.originalName,
          format: artifact.format,
          mediaType: artifact.mediaType,
          byteSize: artifact.bytes.length,
          sha256: artifact.sha256,
          storageKey: artifact.storageKey,
        } } } : {}),
      },
    });
    await tx.auditLog.create({ data: {
      action: "model.register",
      entityType: "ModelVersion",
      entityId: version.id,
      details: { familyId: family.id, version: version.version, artifactSha256: artifact?.sha256 ?? null },
    } });
    return tx.modelVersion.findUniqueOrThrow({ where: { id: version.id }, include: versionInclude });
  });
  return toApiModel(record);
}

export async function addArtifact(versionId: string, artifact: ValidatedArtifact) {
  const prisma = getPrisma();
  const existing = await prisma.modelVersion.findUnique({ where: { id: versionId }, include: { artifact: true } });
  if (!existing) throw new ApiError(404, "model_not_found", "Model version not found.");
  if (existing.artifact) throw new ApiError(409, "artifact_exists", "This model version already has an artifact.");
  await storeArtifact(artifact);
  await prisma.$transaction(async (tx) => {
    await tx.modelArtifact.create({ data: {
      versionId,
      originalName: artifact.originalName,
      format: artifact.format,
      mediaType: artifact.mediaType,
      byteSize: artifact.bytes.length,
      sha256: artifact.sha256,
      storageKey: artifact.storageKey,
    } });
    await tx.auditLog.create({ data: {
      action: "artifact.attach",
      entityType: "ModelVersion",
      entityId: versionId,
      details: { sha256: artifact.sha256, byteSize: artifact.bytes.length },
    } });
  });
  return getModel(versionId);
}

export async function archiveModel(id: string) {
  const prisma = getPrisma();
  const version = await prisma.modelVersion.findUnique({ where: { id }, include: { state: true } });
  if (!version) throw new ApiError(404, "model_not_found", "Model version not found.");
  const active = await prisma.registryDeployment.count({ where: { targetVersionId: id, status: "running" } });
  if (active > 0) throw new ApiError(409, "active_deployment", "Cannot archive a version with a running deployment.");
  await prisma.$transaction(async (tx) => {
    await tx.modelRuntimeState.update({ where: { versionId: id }, data: { status: "archived", trafficPercent: 0 } });
    await tx.auditLog.create({ data: { action: "model.archive", entityType: "ModelVersion", entityId: id, details: {} } });
  });
  return getModel(id);
}
