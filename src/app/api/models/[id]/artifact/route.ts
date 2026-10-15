import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError, readLimitedForm } from "@/lib/api-errors";
import { MAX_ARTIFACT_BYTES, retrieveArtifact, validateArtifact } from "@/lib/artifact-storage";
import { getPrisma } from "@/lib/prisma";
import { addArtifact } from "@/lib/registry";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const artifact = await getPrisma().modelArtifact.findUnique({ where: { versionId: (await params).id } });
    if (!artifact) throw new ApiError(404, "artifact_not_found", "Model artifact not found.");
    const bytes = await retrieveArtifact(artifact.storageKey, artifact.sha256);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": artifact.mediaType,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${artifact.originalName}"`,
        "X-Artifact-SHA256": artifact.sha256,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      throw new ApiError(415, "content_type", "Use multipart/form-data for artifact uploads.");
    }
    if (Number(request.headers.get("content-length") ?? 0) > MAX_ARTIFACT_BYTES + 1024 * 1024) {
      throw new ApiError(413, "request_size", "Upload request is too large.");
    }
    const file = (await readLimitedForm(request, MAX_ARTIFACT_BYTES + 1024 * 1024)).get("artifact");
    if (!(file instanceof File)) throw new ApiError(400, "artifact_required", "Artifact file is required.");
    const model = await addArtifact((await params).id, await validateArtifact(file));
    return NextResponse.json({ model }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
