import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-errors";
import { retryDeployment } from "@/lib/deployments";

type Context = { params: Promise<{ id: string }> };
export async function POST(_request: Request, { params }: Context) {
  try { return NextResponse.json({ deployment: await retryDeployment((await params).id) }); }
  catch (error) { return apiErrorResponse(error); }
}
