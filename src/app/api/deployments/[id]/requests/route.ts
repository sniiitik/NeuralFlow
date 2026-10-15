import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api-errors";
import { getPrisma } from "@/lib/prisma";

type Context = { params: Promise<{ id: string }> };
const roleSchema = z.enum(["stable", "candidate", "shadow"]);

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const role = url.searchParams.has("role") ? roleSchema.parse(url.searchParams.get("role")) : undefined;
    const limit = z.coerce.number().int().min(1).max(100).parse(url.searchParams.get("limit") ?? "25");
    const prisma = getPrisma();
    if (!await prisma.registryDeployment.findUnique({ where: { id }, select: { id: true } })) {
      throw new ApiError(404, "deployment_not_found", "Deployment not found.");
    }
    const requests = await prisma.inferenceRequest.findMany({
      where: { deploymentId: id, ...(role ? { role } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit,
      select: { id: true, requestId: true, versionId: true, slot: true, role: true,
        status: true, inferenceMs: true, prediction: true, probabilities: true, errorCode: true, createdAt: true },
    });
    return NextResponse.json({ requests });
  } catch (error) { return apiErrorResponse(error); }
}
