import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "./api-errors";

export const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_JSON_BYTES = 1024 * 1024;
const TENSOR_ELEMENT_BYTES: Record<string, number> = {
  BOOL: 1, U8: 1, I8: 1,
  F16: 2, BF16: 2, U16: 2, I16: 2,
  F32: 4, U32: 4, I32: 4,
  F64: 8, U64: 8, I64: 8,
};

export type ValidatedArtifact = {
  bytes: Buffer;
  originalName: string;
  format: "json" | "safetensors";
  mediaType: string;
  sha256: string;
  storageKey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSafeTensors(bytes: Buffer) {
  if (bytes.length < 10) throw new ApiError(415, "invalid_artifact", "Invalid safetensors file.");
  const headerLength = Number(bytes.readBigUInt64LE(0));
  if (!Number.isSafeInteger(headerLength) || headerLength < 2 || headerLength > MAX_JSON_BYTES || 8 + headerLength >= bytes.length) {
    throw new ApiError(415, "invalid_artifact", "Invalid safetensors header length.");
  }
  let header: unknown;
  try {
    header = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(8, 8 + headerLength)));
  } catch {
    throw new ApiError(415, "invalid_artifact", "Invalid safetensors header.");
  }
  if (!isRecord(header)) throw new ApiError(415, "invalid_artifact", "Invalid safetensors metadata.");
  const dataLength = bytes.length - 8 - headerLength;
  const ranges: Array<[number, number]> = [];
  for (const [name, descriptor] of Object.entries(header)) {
    if (name === "__metadata__") {
      if (!isRecord(descriptor) || !Object.values(descriptor).every((value) => typeof value === "string")) {
        throw new ApiError(415, "invalid_artifact", "Invalid safetensors metadata.");
      }
      continue;
    }
    if (!isRecord(descriptor) || typeof descriptor.dtype !== "string" || !Array.isArray(descriptor.shape) ||
        !descriptor.shape.every((item) => Number.isSafeInteger(item) && item >= 0) ||
        !Array.isArray(descriptor.data_offsets) || descriptor.data_offsets.length !== 2) {
      throw new ApiError(415, "invalid_artifact", "Invalid safetensors tensor descriptor.");
    }
    const elementBytes = TENSOR_ELEMENT_BYTES[descriptor.dtype];
    const elementCount = descriptor.shape.reduce<number>((count, dimension) => count * dimension, 1);
    if (!elementBytes || !Number.isSafeInteger(elementCount) || elementCount < 1 || elementCount * elementBytes > MAX_ARTIFACT_BYTES) {
      throw new ApiError(415, "invalid_artifact", "Invalid safetensors dtype or shape.");
    }
    const [start, end] = descriptor.data_offsets;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end - start !== elementCount * elementBytes || end > dataLength) {
      throw new ApiError(415, "invalid_artifact", "Invalid safetensors data offsets.");
    }
    ranges.push([start, end]);
  }
  if (ranges.length === 0) throw new ApiError(415, "invalid_artifact", "Safetensors file contains no tensors.");
  ranges.sort((a, b) => a[0] - b[0]);
  if (ranges[0][0] !== 0 || ranges.at(-1)?.[1] !== dataLength || ranges.some((range, index) => index > 0 && range[0] !== ranges[index - 1][1])) {
    throw new ApiError(415, "invalid_artifact", "Safetensors data ranges are incomplete or overlapping.");
  }
}

export async function validateArtifact(file: File): Promise<ValidatedArtifact> {
  if (file.size === 0 || file.size > MAX_ARTIFACT_BYTES) {
    throw new ApiError(413, "artifact_size", `Artifact must be between 1 byte and ${MAX_ARTIFACT_BYTES} bytes.`);
  }
  const originalName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  const extension = path.extname(originalName).toLowerCase();
  if (extension !== ".json" && extension !== ".safetensors") {
    throw new ApiError(415, "artifact_format", "Only declarative .json and .safetensors artifacts are accepted.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new ApiError(400, "artifact_size", "Artifact size changed during upload.");
  if (extension === ".json") {
    if (bytes.length > MAX_JSON_BYTES) throw new ApiError(413, "artifact_size", "JSON artifacts must be at most 1 MiB.");
    let content: unknown;
    try {
      content = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new ApiError(415, "invalid_artifact", "Artifact is not valid UTF-8 JSON.");
    }
    if (!isRecord(content) || content.schemaVersion !== 1 || !isRecord(content.model)) {
      throw new ApiError(415, "invalid_artifact", "JSON artifacts require schemaVersion 1 and a model object.");
    }
  } else {
    validateSafeTensors(bytes);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    originalName,
    format: extension === ".json" ? "json" : "safetensors",
    mediaType: extension === ".json" ? "application/json" : "application/octet-stream",
    sha256,
    storageKey: `${sha256.slice(0, 2)}/${sha256}`,
  };
}

function storageRoot() {
  return path.resolve(process.env.ARTIFACT_STORAGE_DIR ?? path.join(process.cwd(), "var", "artifacts"));
}

function storagePath(key: string) {
  if (!/^[0-9a-f]{2}\/[0-9a-f]{64}$/.test(key) || key.slice(0, 2) !== key.slice(3, 5)) {
    throw new ApiError(500, "artifact_path", "Invalid stored artifact path.");
  }
  return path.join(storageRoot(), key);
}

export async function storeArtifact(artifact: ValidatedArtifact) {
  const destination = storagePath(artifact.storageKey);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, artifact.bytes, { mode: 0o600, flag: "wx" });
  await rename(temporary, destination);
}

export async function retrieveArtifact(key: string, expectedSha256: string) {
  let bytes: Buffer;
  try {
    bytes = await readFile(storagePath(key));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      throw new ApiError(404, "artifact_missing", "Artifact bytes are not available in the configured storage volume.");
    }
    throw error;
  }
  if (createHash("sha256").update(bytes).digest("hex") !== expectedSha256) {
    throw new ApiError(409, "artifact_corrupt", "Stored artifact checksum does not match registry metadata.");
  }
  return bytes;
}
