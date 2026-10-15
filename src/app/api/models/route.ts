import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError, readJson, readLimitedForm } from "@/lib/api-errors";
import { MAX_ARTIFACT_BYTES, validateArtifact } from "@/lib/artifact-storage";
import { createModel, listModels } from "@/lib/registry";
import { registerModelSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ models: await listModels() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let input: unknown;
    let artifact: Awaited<ReturnType<typeof validateArtifact>> | undefined;
    if (contentType.includes("multipart/form-data")) {
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (contentLength > MAX_ARTIFACT_BYTES + 1024 * 1024) {
        throw new ApiError(413, "request_size", "Upload request is too large.");
      }
      const form = await readLimitedForm(request, MAX_ARTIFACT_BYTES + 1024 * 1024);
      input = {
        name: form.get("name"),
        version: form.get("version"),
        framework: form.get("framework"),
        owner: form.get("owner") ?? form.get("team") ?? "Unassigned",
        description: form.get("description") ?? "",
        runtime: form.get("runtime") ?? "cpu-small",
        replicas: form.get("replicas") ?? 1,
        status: form.get("status") ?? "shadow",
      };
      const file = form.get("artifact");
      if (file instanceof File && file.size > 0) artifact = await validateArtifact(file);
      else if (file !== null && !(file instanceof File)) throw new ApiError(400, "invalid_artifact", "Artifact must be a file.");
    } else if (contentType.includes("application/json")) {
      input = await readJson(request);
    } else {
      throw new ApiError(415, "content_type", "Use application/json or multipart/form-data.");
    }
    const model = await createModel(registerModelSchema.parse(input), artifact);
    return NextResponse.json({ model }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
