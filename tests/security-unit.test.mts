import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, readJson, readLimitedForm } from "../src/lib/api-errors";

test("rejects oversized JSON even without Content-Length", async () => {
  const request = new Request("http://localhost/api/models", { method: "POST", body: "x".repeat(1024 * 1024 + 1) });
  request.headers.delete("content-length");
  await assert.rejects(readJson(request), (error: unknown) => error instanceof ApiError && error.status === 413);
});

test("rejects malformed JSON and oversized multipart bodies", async () => {
  await assert.rejects(readJson(new Request("http://localhost/api/models", { method: "POST", body: "{" })),
    (error: unknown) => error instanceof ApiError && error.code === "invalid_json");
  const request = new Request("http://localhost/api/models", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" },
    body: "x".repeat(100) });
  await assert.rejects(readLimitedForm(request, 50), (error: unknown) => error instanceof ApiError && error.status === 413);
});
