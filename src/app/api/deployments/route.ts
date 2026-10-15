import { NextResponse } from "next/server";
import { apiErrorResponse, readJson } from "@/lib/api-errors";
import { createDeployment, listDeployments } from "@/lib/deployments";
import { deploymentCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ deployments: await listDeployments() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const deployment = await createDeployment(deploymentCreateSchema.parse(await readJson(request)));
    return NextResponse.json({ deployment }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
