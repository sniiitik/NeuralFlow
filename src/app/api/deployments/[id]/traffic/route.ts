import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as { trafficPercent?: number };
  const trafficPercent = Math.max(0, Math.min(Number(body.trafficPercent ?? 0), 100));

  const store = getStore();
  const deployment = store.deployments.find((item) => item.id === id);

  if (!deployment) {
    return NextResponse.json({ error: "deployment not found" }, { status: 404 });
  }

  deployment.trafficPercent = deployment.strategy === "shadow" ? 0 : trafficPercent;
  deployment.updatedAt = new Date().toISOString();

  await prisma.mLModel.update({
    where: { id: deployment.modelId },
    data: {
      trafficPercent: deployment.trafficPercent,
    },
  });

  const model = store.models.find((item) => item.id === deployment.modelId);
  if (model) {
    model.trafficPercent = deployment.trafficPercent;
    model.lastDeployedAt = deployment.updatedAt;
  }

  return NextResponse.json({ deployment });
}
