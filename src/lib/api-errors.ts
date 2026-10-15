import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    const bytes = await readLimitedBody(request, 1024 * 1024);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

export async function readLimitedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) throw new ApiError(413, "request_size", "Request body is too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new ApiError(413, "request_size", "Request body is too large.");
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export async function readLimitedForm(request: Request, maxBytes: number) {
  const body = await readLimitedBody(request, maxBytes);
  return new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type") ?? "" }, body: new Blob([body.buffer as ArrayBuffer]) }).formData();
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", code: "validation_error", issues: error.issues }, { status: 400 });
  }
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "P2002") return NextResponse.json({ error: "Resource already exists", code: "duplicate" }, { status: 409 });
  if (code === "P2025") return NextResponse.json({ error: "Resource not found or state changed", code: "not_found" }, { status: 404 });
  if (code === "P2003") return NextResponse.json({ error: "Referenced resource does not exist", code: "invalid_reference" }, { status: 400 });
  if (code === "P2004") return NextResponse.json({ error: "Database constraint rejected the request", code: "constraint" }, { status: 409 });
  console.error("NeuralFlow API error", error);
  return NextResponse.json({ error: "Internal server error", code: "internal_error" }, { status: 500 });
}
