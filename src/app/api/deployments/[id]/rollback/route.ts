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

  deployment.status = "rolled_back";
  deployment.trafficPercent = 0;
  deployment.updatedAt = new Date().toISOString();

  await prisma.mLModel.update({
    where: { id: deployment.modelId },
    data: {
      status: "live",
      version: deployment.fromVersion,
      trafficPercent: 100,
    },
  });

  const model = store.models.find((item) => item.id === deployment.modelId);
  if (model) {
    model.status = "live";
    model.version = deployment.fromVersion;
    model.trafficPercent = 100;
    model.lastDeployedAt = deployment.updatedAt;
  }

  addEvent({
    title: "Deployment rolled back",
    description: `${deployment.modelName} returned to ${deployment.fromVersion}.`,
    type: "rollback",
  });

  return NextResponse.json({ deployment });
}
