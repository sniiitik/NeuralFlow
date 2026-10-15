import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.slice(1).endsWith("_test")) {
  throw new Error("Set TEST_DATABASE_URL to an isolated database whose name ends in _test.");
}
process.env.DATABASE_URL = testUrl;
process.env.ARTIFACT_STORAGE_DIR = await mkdtemp(path.join(tmpdir(), "neuralflow-inference-"));
process.env.INFERENCE_RUNTIME_URL ??= "http://127.0.0.1:8001";

const { POST: registerModel } = await import("../src/app/api/models/route");
const { GET: listDeployments, POST: activate } = await import("../src/app/api/inference/deployments/route");
const { POST: predict } = await import("../src/app/api/inference/predict/route");
const { getPrisma } = await import("../src/lib/prisma");

function jsonRequest(pathname: string, body: unknown) {
  return new Request(`http://test${pathname}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const setosa = { sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2 };
const virginica = { sepal_length: 6.7, sepal_width: 3.0, petal_length: 5.2, petal_width: 2.3 };

test("real Iris artifacts register, activate, and predict through API routes", async (t) => {
  const family = `iris-test-${randomUUID()}`;
  const ids: Record<string, string> = {};
  for (const version of ["v1", "v2"]) {
    await t.test(`registers trained ${version} artifact`, async () => {
      const bytes = await readFile(`inference/examples/iris-${version}.json`);
      const form = new FormData();
      form.set("name", family);
      form.set("version", version);
      form.set("framework", "sklearn");
      form.set("owner", "Inference test");
      form.set("artifact", new File([bytes], `iris-${version}.json`, { type: "application/json" }));
      const response = await registerModel(new Request("http://test/api/models", { method: "POST", body: form }));
      assert.equal(response.status, 201, await response.clone().text());
      ids[version] = (await response.clone().json()).model.id;
    });
  }
  const deployments: Record<string, string> = {};
  for (const version of ["v1", "v2"]) {
    await t.test(`activates and predicts from ${version}`, async () => {
      const response = await activate(jsonRequest("/api/inference/deployments", { versionId: ids[version] }));
      assert.equal(response.status, 201, await response.clone().text());
      deployments[version] = (await response.clone().json()).deploymentId;
      const input = version === "v1" ? setosa : virginica;
      const result = await predict(jsonRequest("/api/inference/predict", { deploymentId: deployments[version], features: input }));
      assert.equal(result.status, 200, await result.clone().text());
      const body = await result.clone().json();
      assert.equal(body.modelVersion, version);
      assert.equal(body.modelVersionId, ids[version]);
      assert.equal(body.prediction, version === "v1" ? "setosa" : "virginica");
      assert.ok(body.inferenceMs >= 0);
      assert.ok(Math.abs(Object.values(body.probabilities as Record<string, number>).reduce((sum, item) => sum + item, 0) - 1) < 1e-10);
    });
  }
  await t.test("lists both deployments and rejects invalid requests", async () => {
    const available = await listDeployments();
    const items = (await available.json()).deployments as Array<{ id: string }>;
    assert.ok(items.some((item) => item.id === deployments.v1));
    assert.ok(items.some((item) => item.id === deployments.v2));
    const invalid = await predict(jsonRequest("/api/inference/predict", { deploymentId: deployments.v1, features: { ...setosa, petal_width: -1 } }));
    assert.equal(invalid.status, 400);
    const missing = await predict(jsonRequest("/api/inference/predict", { deploymentId: "missing", features: setosa }));
    assert.equal(missing.status, 404);
  });
  await t.test("rejects a registry JSON artifact outside the executable Iris schema", async () => {
    const form = new FormData();
    form.set("name", `${family}-unsupported`);
    form.set("version", "v1");
    form.set("framework", "sklearn");
    form.set("artifact", new File([JSON.stringify({ schemaVersion: 1, model: { weights: [1, 2] } })], "other.json"));
    const registered = await registerModel(new Request("http://test/api/models", { method: "POST", body: form }));
    assert.equal(registered.status, 201);
    const versionId = (await registered.json()).model.id;
    const response = await activate(jsonRequest("/api/inference/deployments", { versionId }));
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, "runtime_rejected");
  });
  await getPrisma().$disconnect();
});
