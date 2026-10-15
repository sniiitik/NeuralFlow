import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { getDeployment } from "@/lib/deployments";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    return NextResponse.json({ deployment: await getDeployment((await params).id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
