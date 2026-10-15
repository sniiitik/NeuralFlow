import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.slice(1).endsWith("_test")) throw new Error("Use an isolated *_test database.");
process.env.DATABASE_URL = testUrl;
process.env.ARTIFACT_STORAGE_DIR = await mkdtemp(path.join(tmpdir(), "neuralflow-routing-"));
process.env.INFERENCE_RUNTIME_URL ??= "http://127.0.0.1:8001";
process.env.INFERENCE_RUNTIME_GREEN_URL ??= "http://127.0.0.1:8002";

const { POST: register } = await import("../src/app/api/models/route");
const { POST: deploy, GET: listDeployments } = await import("../src/app/api/deployments/route");
const { PATCH: traffic } = await import("../src/app/api/deployments/[id]/traffic/route");
const { POST: promote } = await import("../src/app/api/deployments/[id]/promote/route");
const { POST: rollback } = await import("../src/app/api/deployments/[id]/rollback/route");
const { GET: getRequests } = await import("../src/app/api/deployments/[id]/requests/route");
const { POST: predict } = await import("../src/app/api/inference/predict/route");
const { getPrisma } = await import("../src/lib/prisma");
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const features = { sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2 };
const jsonRequest = (url: string, body: unknown, method = "POST") =>
  new Request(`http://test${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("canary, blue-green, and shadow route genuine Iris predictions", async (t) => {
  const prisma = getPrisma();
  const name = `routing-${randomUUID()}`;
  const versions: Record<string, string> = {};
  for (const version of ["v1", "v2"]) {
    const form = new FormData();
    form.set("name", name);
    form.set("version", version);
    form.set("framework", "sklearn");
    form.set("owner", "Routing test");
    form.set("artifact", new File([await readFile(`inference/examples/iris-${version}.json`)], `iris-${version}.json`, { type: "application/json" }));
    const response = await register(new Request("http://test/api/models", { method: "POST", body: form }));
    assert.equal(response.status, 201, await response.clone().text());
    versions[version] = (await response.json()).model.id;
  }
  const familyId = (await prisma.modelVersion.findUniqueOrThrow({ where: { id: versions.v1 } })).familyId;
  const create = async (strategy: "canary" | "blue-green" | "shadow", percent: number) => {
    const response = await deploy(jsonRequest("/api/deployments", {
      modelId: versions.v1, fromVersion: "v1", toVersion: "v2", strategy,
      trafficPercent: percent, idempotencyKey: randomUUID(),
    }));
    assert.equal(response.status, 201, await response.clone().text());
    return (await response.json()).deployment.id as string;
  };
  const routed = async () => {
    const response = await predict(jsonRequest("/api/inference/predict", { familyId, features }));
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<{ modelVersion: string; servingRole: string; servingSlot: string; fallbackFromCandidate: boolean }>;
  };
  const action = async (fn: typeof promote | typeof rollback, id: string) => {
    const response = await fn(new Request("http://test", { method: "POST" }), params(id));
    assert.equal(response.status, 200, await response.clone().text());
  };

  await t.test("90/10 canary distribution is measured from 1,000 real predictions", async () => {
    const id = await create("canary", 10);
    const route = await prisma.servingRoute.findUniqueOrThrow({ where: { familyId } });
    assert.equal(route.activeSlot, "blue");
    assert.equal(route.candidateSlot, "green");
    const headers = { "X-NeuralFlow-Runtime-Token": process.env.INFERENCE_RUNTIME_TOKEN ?? "" };
    const blueReady = await fetch(`http://127.0.0.1:8001/v1/models/${versions.v1}/readyz?sha256=${(await prisma.modelArtifact.findUniqueOrThrow({ where: { versionId: versions.v1 } })).sha256}`, { headers });
    const greenReady = await fetch(`http://127.0.0.1:8002/v1/models/${versions.v2}/readyz?sha256=${(await prisma.modelArtifact.findUniqueOrThrow({ where: { versionId: versions.v2 } })).sha256}`, { headers });
    assert.equal(blueReady.status, 200);
    assert.equal(greenReady.status, 200);
    for (let i = 0; i < 1000; i++) {
      const result = await routed();
      assert.ok(["v1", "v2"].includes(result.modelVersion));
    }
    const stable = await prisma.inferenceRequest.count({ where: { deploymentId: id, role: "stable", status: "success" } });
    const candidate = await prisma.inferenceRequest.count({ where: { deploymentId: id, role: "candidate", status: "success" } });
    assert.equal(stable + candidate, 1000);
    assert.ok(candidate >= 65 && candidate <= 135, `Expected 90/10 ±3.5 percentage points, observed ${candidate}/1000`);
    console.log(`CANARY_OBSERVED stable=${stable} candidate=${candidate} candidatePercent=${candidate / 10}%`);
    const listed = await listDeployments();
    const displayed = (await listed.json()).deployments.find((item: { id: string }) => item.id === id);
    assert.equal(displayed.observed.stable, stable);
    assert.equal(displayed.observed.candidate, candidate);
    assert.equal(displayed.observed.candidatePercent, candidate / 10);
    assert.ok(displayed.stableLatencyMs > 0);
    assert.ok(displayed.canaryLatencyMs > 0);

    process.env.INFERENCE_RUNTIME_GREEN_URL = "http://127.0.0.1:1";
    const allCandidate = await traffic(jsonRequest(`/api/deployments/${id}/traffic`, { trafficPercent: 100 }, "PATCH"), params(id));
    assert.equal(allCandidate.status, 200);
    const fallback = await routed();
    assert.equal(fallback.modelVersion, "v1");
    assert.equal(fallback.fallbackFromCandidate, true);
    assert.equal(await prisma.inferenceRequest.count({ where: { deploymentId: id, role: "candidate", status: "failed" } }), 1);
    process.env.INFERENCE_RUNTIME_GREEN_URL = "http://127.0.0.1:8002";
    await action(promote, id);
    const promoted = await routed();
    assert.equal(promoted.modelVersion, "v2");
    assert.equal(promoted.servingSlot, "green");
    await action(rollback, id);
    const restored = await routed();
    assert.equal(restored.modelVersion, "v1");
    assert.equal(restored.servingSlot, "blue");
  });

  await t.test("blue-green prepares a separate slot and switches atomically", async () => {
    const id = await create("blue-green", 50);
    const before = await prisma.servingRoute.findUniqueOrThrow({ where: { familyId } });
    assert.equal(before.trafficPercent, 0);
    assert.equal(before.activeSlot, "blue");
    assert.equal(before.candidateSlot, "green");
    assert.equal((await routed()).modelVersion, "v1");
    const invalidTraffic = await traffic(jsonRequest(`/api/deployments/${id}/traffic`, { trafficPercent: 50 }, "PATCH"), params(id));
    assert.equal(invalidTraffic.status, 409);
    await action(promote, id);
    const fresh = spawnSync(process.execPath, ["--import", "tsx", "tests/predict-serving-route.mts", familyId], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: testUrl }, encoding: "utf8",
    });
    assert.equal(fresh.status, 0, fresh.stderr);
    const afterRestart = JSON.parse(fresh.stdout.trim());
    assert.equal(afterRestart.modelVersion, "v2");
    assert.equal(afterRestart.servingSlot, "green");
    console.log(`BLUE_GREEN_OBSERVED promotedVersion=${afterRestart.modelVersion} promotedSlot=${afterRestart.servingSlot}`);
    await action(rollback, id);
    assert.equal((await routed()).modelVersion, "v1");
  });

  await t.test("shadow mirrors predictions and isolates candidate failures", async () => {
    const id = await create("shadow", 100);
    for (let i = 0; i < 25; i++) {
      const result = await routed();
      assert.equal(result.modelVersion, "v1");
      assert.equal(result.servingRole, "stable");
    }
    const mirrors = await prisma.inferenceRequest.findMany({ where: { deploymentId: id, role: "shadow", status: "success" } });
    assert.equal(mirrors.length, 25);
    console.log(`SHADOW_OBSERVED stableResponses=25 candidateExecutions=${mirrors.length}`);
    assert.ok(mirrors.every((item) => item.versionId === versions.v2 && typeof item.prediction === "string" && item.probabilities));
    const recorded = await getRequests(new Request(`http://test/api/deployments/${id}/requests?role=shadow&limit=25`), params(id));
    assert.equal(recorded.status, 200);
    assert.equal((await recorded.json()).requests.length, 25);
    process.env.INFERENCE_RUNTIME_GREEN_URL = "http://127.0.0.1:1";
    const response = await routed();
    assert.equal(response.modelVersion, "v1");
    assert.equal(await prisma.inferenceRequest.count({ where: { deploymentId: id, role: "shadow", status: "failed" } }), 1);
    process.env.INFERENCE_RUNTIME_GREEN_URL = "http://127.0.0.1:8002";
    await action(rollback, id);
  });
  await prisma.$disconnect();
});
