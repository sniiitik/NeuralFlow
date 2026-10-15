import { NextResponse } from "next/server";
import { apiErrorResponse, readJson } from "@/lib/api-errors";
import { activateInferenceVersion, listInferenceDeployments } from "@/lib/inference";
import { inferenceActivationSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json({ deployments: await listInferenceDeployments() }); }
  catch (error) { return apiErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { versionId } = inferenceActivationSchema.parse(await readJson(request));
    return NextResponse.json(await activateInferenceVersion(versionId), { status: 201 });
  } catch (error) { return apiErrorResponse(error); }
}
