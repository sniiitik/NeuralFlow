import { NextResponse } from "next/server";
import { apiErrorResponse, readJson } from "@/lib/api-errors";
import { updateDeploymentTraffic } from "@/lib/deployments";
import { trafficUpdateSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { trafficPercent } = trafficUpdateSchema.parse(await readJson(request));
    return NextResponse.json({ deployment: await updateDeploymentTraffic((await params).id, trafficPercent) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
