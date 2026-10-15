import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { finishDeployment } from "@/lib/deployments";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  try {
    return NextResponse.json({ deployment: await finishDeployment((await params).id, "rollback") });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
