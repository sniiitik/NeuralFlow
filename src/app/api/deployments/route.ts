import { NextResponse } from "next/server";
import { addEvent, createId, getStore } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import type { Deployment, DeploymentStrategy } from "@/lib/types";

export const dynamic = "force-dynamic";

const strategies: DeploymentStrategy[] = ["canary", "blue-green", "shadow"];

export async function GET() {
  const store = getStore();
  return NextResponse.json({ deployments: store.deployments });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    modelId?: string;
    fromVersion?: string;
    toVersion?: string;
    strategy?: DeploymentStrategy;
    trafficPercent?: number;
  };

  const store = getStore();
  const dbModel = body.modelId
    ? await prisma.mLModel.findUnique({
        where: { id: body.modelId },
      })
    : null;

  if (!dbModel || !body.toVersion) {
    return NextResponse.json({ error: "modelId and toVersion are required" }, { status: 400 });
  }

  const strategy = strategies.includes(body.strategy as DeploymentStrategy) ? (body.strategy as DeploymentStrategy) : "canary";
  const trafficPercent = strategy === "shadow" ? 0 : Math.max(1, Math.min(Number(body.trafficPercent ?? 10), 100));
  const now = new Date().toISOString();
  const stableLatencyMs = dbModel.latencyMs;

  const deployment: Deployment = {
    id: createId("dep"),
    modelId: dbModel.id,
    modelName: dbModel.name,
    fromVersion: body.fromVersion || dbModel.version,
    toVersion: body.toVersion,
    strategy,
    status: "running",
    trafficPercent,
    stableLatencyMs,
    canaryLatencyMs: stableLatencyMs + Math.round(2 + Math.random() * 8),
    startedAt: now,
    updatedAt: now,
  };

  await prisma.mLModel.update({
    where: { id: dbModel.id },
    data: {
      status: strategy === "shadow" ? "shadow" : strategy === "blue-green" ? "rolling" : "canary",
      version: body.toVersion,
      trafficPercent,
    },
  });

  const storeModel = store.models.find((item) => item.id === dbModel.id);
  if (storeModel) {
    storeModel.status = strategy === "shadow" ? "shadow" : strategy === "blue-green" ? "rolling" : "canary";
    storeModel.version = body.toVersion;
    storeModel.trafficPercent = trafficPercent;
    storeModel.lastDeployedAt = now;
  }

  store.deployments.unshift(deployment);

  addEvent({
    title: "Deployment started",
    description: `${dbModel.name} ${deployment.toVersion} started with ${strategy} strategy.`,
    type: "deploy",
  });

  return NextResponse.json({ deployment }, { status: 201 });
}
