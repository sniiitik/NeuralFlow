import { NextResponse } from "next/server";
import { apiErrorResponse, readJson } from "@/lib/api-errors";
import { predict, predictFamily } from "@/lib/inference";
import { inferenceInputSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const { deploymentId, familyId, features } = inferenceInputSchema.parse(await readJson(request));
    const source = request.headers.get("x-neuralflow-trusted-role") === "demo" ? "demo" : "user";
    return NextResponse.json(familyId
      ? await predictFamily(familyId, features, request.headers.get("x-request-id"), source)
      : await predict(deploymentId!, features, request.headers.get("x-request-id"), source));
  } catch (error) { return apiErrorResponse(error); }
}
