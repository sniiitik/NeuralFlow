import { NextResponse } from "next/server";
import { addEvent, getStore } from "@/lib/store";
import { initialModels } from "@/lib/mock-data";
import { prisma } from "@/lib/prisma";
import type { MLModel, ModelStatus } from "@/lib/types";

type ModelCreateInput = {
  name: string;
  version: string;
  framework: string;
  team: string;
  artifactName?: string;
  artifactPath?: string;
  artifactSizeKb?: number;
  status?: ModelStatus;
  trafficPercent?: number;
  latencyMs?: number;
  errorRate?: number;
  driftScore?: number;
};

function toApiModel(model: {
  id: string;
  name: string;
  version: string;
  framework: string;
  team: string;
  artifactName: string | null;
  artifactSizeKb: number | null;
  status: string;
  trafficPercent: number;
  latencyMs: number;
  errorRate: number;
  driftScore: number;
  createdAt: Date;
  updatedAt: Date;
}): MLModel {
  return {
    id: model.id,
    name: model.name,
    version: model.version,
    framework: model.framework as MLModel["framework"],
    status: model.status as ModelStatus,
    owner: model.team,
    description: "",
    runtime: "cpu-small",
    replicas: 1,
    artifactName: model.artifactName ?? undefined,
    artifactSizeKb: model.artifactSizeKb ?? undefined,
    trafficPercent: model.trafficPercent,
    requestsPerSecond: 0,
    avgLatencyMs: model.latencyMs,
    errorRate: model.errorRate,
    driftScore: model.driftScore,
    createdAt: model.createdAt.toISOString(),
    lastDeployedAt: model.updatedAt.toISOString(),
  };
}

function syncStoreModels(models: MLModel[]) {
  getStore().models = models;
}

async function ensureSeededModels() {
  const count = await prisma.mLModel.count();

  if (count > 0) {
    return;
  }

  await prisma.mLModel.createMany({
    data: initialModels.map((model) => ({
      id: model.id,
      name: model.name,
      version: model.version,
      framework: model.framework,
      team: model.owner,
      artifactName: model.artifactName,
      artifactSizeKb: model.artifactSizeKb,
      status: model.status,
      trafficPercent: model.trafficPercent,
      latencyMs: model.avgLatencyMs,
      errorRate: model.errorRate,
      driftScore: model.driftScore,
      createdAt: new Date(model.createdAt),
      updatedAt: new Date(model.lastDeployedAt),
    })),
  });
}

async function parseBody(req: Request): Promise<ModelCreateInput> {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const artifact = formData.get("artifact");
    const artifactFile = artifact instanceof File && artifact.size > 0 ? artifact : null;

    return {
      name: String(formData.get("name") ?? "").trim(),
      version: String(formData.get("version") ?? "").trim(),
      framework: String(formData.get("framework") ?? "").trim(),
      team: String(formData.get("owner") ?? formData.get("team") ?? "").trim() || "Unassigned",
      artifactName: artifactFile?.name,
      artifactPath: artifactFile ? `uploads/${artifactFile.name}` : undefined,
      artifactSizeKb: artifactFile ? Math.max(1, Math.round(artifactFile.size / 1024)) : undefined,
      status: (String(formData.get("status") ?? "shadow").trim() || "shadow") as ModelStatus,
      trafficPercent: 0,
      latencyMs: 0,
      errorRate: 0,
      driftScore: 0,
    };
  }

  const body = (await req.json()) as Partial<MLModel> & {
    team?: string;
    latencyMs?: number;
  };

  return {
    name: String(body.name ?? "").trim(),
    version: String(body.version ?? "").trim(),
    framework: String(body.framework ?? "").trim(),
    team: String(body.owner ?? body.team ?? "").trim() || "Unassigned",
    artifactName: body.artifactName,
    artifactPath: undefined,
    artifactSizeKb: body.artifactSizeKb,
    status: body.status,
    trafficPercent: body.trafficPercent,
    latencyMs: body.avgLatencyMs ?? body.latencyMs,
    errorRate: body.errorRate,
    driftScore: body.driftScore,
  };
}

export async function GET() {
  await ensureSeededModels();

  const models = await prisma.mLModel.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });

  const apiModels = models.map(toApiModel);
  syncStoreModels(apiModels);

  return NextResponse.json({ models: apiModels });
}

export async function POST(req: Request) {
  const body = await parseBody(req);

  if (!body.name || !body.version || !body.framework) {
    return NextResponse.json({ error: "name, version, and framework are required" }, { status: 400 });
  }

  const model = await prisma.mLModel.create({
    data: {
      name: body.name,
      version: body.version,
      framework: body.framework,
      team: body.team,

      artifactName: body.artifactName,
      artifactPath: body.artifactPath,
      artifactSizeKb: body.artifactSizeKb,

      status: body.status || "shadow",
      trafficPercent: body.trafficPercent ?? 0,

      latencyMs: body.latencyMs ?? 0,
      errorRate: body.errorRate ?? 0,
      driftScore: body.driftScore ?? 0,
    },
  });

  const apiModel = toApiModel(model);
  syncStoreModels([apiModel, ...getStore().models.filter((item) => item.id !== apiModel.id)]);

  addEvent({
    title: "Model registered",
    description: `${apiModel.name} ${apiModel.version} added to the registry.`,
    type: "model",
  });

  return NextResponse.json({ model: apiModel }, { status: 201 });
}
