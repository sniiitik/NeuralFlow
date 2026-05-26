import { NextResponse } from "next/server";
import { addEvent, getStore } from "@/lib/store";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const store = getStore();
  const deployment = store.deployments.find((item) => item.id === id);

  if (!deployment) {
    return NextResponse.json({ error: "deployment not found" }, { status: 404 });
  }

  deployment.status = "completed";
  deployment.trafficPercent = 100;
  deployment.updatedAt = new Date().toISOString();

  await prisma.mLModel.update({
    where: { id: deployment.modelId },
    data: {
      status: "live",
      version: deployment.toVersion,
      trafficPercent: 100,
      latencyMs: deployment.canaryLatencyMs,
    },
  });

  const model = store.models.find((item) => item.id === deployment.modelId);
  if (model) {
    model.status = "live";
    model.version = deployment.toVersion;
    model.trafficPercent = 100;
    model.avgLatencyMs = deployment.canaryLatencyMs;
    model.lastDeployedAt = deployment.updatedAt;
  }

  addEvent({
    title: "Deployment promoted",
    description: `${deployment.modelName} ${deployment.toVersion} promoted to 100% traffic.`,
    type: "promote",
  });

  return NextResponse.json({ deployment });
}
