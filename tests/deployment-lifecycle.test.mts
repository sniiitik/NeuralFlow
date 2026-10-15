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
process.env.ARTIFACT_STORAGE_DIR = await mkdtemp(path.join(tmpdir(), "neuralflow-lifecycle-"));
process.env.INFERENCE_RUNTIME_URL ??= "http://127.0.0.1:8001";

const { POST: register } = await import("../src/app/api/models/route");
const { POST: create, GET: list } = await import("../src/app/api/deployments/route");
const { PATCH: traffic } = await import("../src/app/api/deployments/[id]/traffic/route");
const { POST: promote } = await import("../src/app/api/deployments/[id]/promote/route");
const { POST: rollback } = await import("../src/app/api/deployments/[id]/rollback/route");
const { POST: retry } = await import("../src/app/api/deployments/[id]/retry/route");
const { POST: predict } = await import("../src/app/api/inference/predict/route");
const { getPrisma } = await import("../src/lib/prisma");
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (url: string, body: unknown, method = "POST") =>
  new Request(`http://test${url}`, { method, headers: { "content-type": "application/json", "x-request-id": randomUUID() }, body: JSON.stringify(body) });
const features = { sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2 };

test("durable runtime deployment lifecycle changes actual predictions", async (t) => {
  const prisma = getPrisma();
  const family = `lifecycle-${randomUUID()}`;
  const ids: Record<string, string> = {};
  for (const version of ["v1", "v2"]) {
    const form = new FormData();
    form.set("name", family);
    form.set("version", version);
    form.set("framework", "sklearn");
    form.set("owner", "Lifecycle test");
    form.set("artifact", new File([await readFile(`inference/examples/iris-${version}.json`)], `iris-${version}.json`, { type: "application/json" }));
    const response = await register(new Request("http://test/api/models", { method: "POST", body: form }));
    assert.equal(response.status, 201, await response.clone().text());
    ids[version] = (await response.json()).model.id;
  }
  const familyId = (await prisma.modelVersion.findUniqueOrThrow({ where: { id: ids.v1 } })).familyId;
  const base = { modelId: ids.v1, fromVersion: "v1", toVersion: "v2", strategy: "canary", trafficPercent: 0 };
  const prediction = async () => {
    const response = await predict(request("/api/inference/predict", { familyId, features }));
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<{ modelVersion: string; prediction: string; servingRole: string }>;
  };
  let deploymentId = "";
  await t.test("validates versions and rejects conflicting operations", async () => {
    const invalid = await create(request("/api/deployments", { ...base, toVersion: "missing" }));
    assert.equal(invalid.status, 404);
    const missingArtifact = await create(request("/api/deployments", { ...base, modelId: "missing" }));
    assert.equal(missingArtifact.status, 404);
  });
  await t.test("loads both versions, verifies readiness, and routes traffic", async () => {
    const key = randomUUID();
    const response = await create(request("/api/deployments", { ...base, idempotencyKey: key }));
    assert.equal(response.status, 201, await response.clone().text());
    const deployment = (await response.json()).deployment;
    deploymentId = deployment.id;
    assert.equal(deployment.lifecycleState, "active");
    assert.equal((await prediction()).modelVersion, "v1");
    const conflict = await create(request("/api/deployments", { ...base, idempotencyKey: randomUUID() }));
    assert.equal(conflict.status, 409);
    const replay = await create(request("/api/deployments", { ...base, idempotencyKey: key }));
    assert.equal(replay.status, 201);
    assert.equal((await replay.json()).deployment.id, deploymentId);
    const changedPayload = await create(request("/api/deployments", { ...base, trafficPercent: 50, idempotencyKey: key }));
    assert.equal(changedPayload.status, 409);
    const changed = await traffic(request(`/api/deployments/${deploymentId}/traffic`, { trafficPercent: 100 }, "PATCH"), params(deploymentId));
    assert.equal(changed.status, 200, await changed.clone().text());
    assert.equal((await prediction()).modelVersion, "v2");
  });
  await t.test("promotion and post-promotion rollback change the serving version", async () => {
    const result = await promote(new Request("http://test", { method: "POST" }), params(deploymentId));
    assert.equal(result.status, 200, await result.clone().text());
    assert.equal((await prediction()).modelVersion, "v2");
    const rolled = await rollback(new Request("http://test", { method: "POST" }), params(deploymentId));
    assert.equal(rolled.status, 200, await rolled.clone().text());
    assert.equal((await prediction()).modelVersion, "v1");
    assert.equal((await prisma.servingRoute.findUniqueOrThrow({ where: { familyId } })).activeVersionId, ids.v1);
    const events = (await prisma.deploymentEvent.findMany({ where: { deploymentId }, orderBy: { createdAt: "asc" } })).map((item) => item.action);
    for (const action of ["pending", "preparing", "starting", "healthy", "active", "traffic_changed", "promote", "rollback"]) assert.ok(events.includes(action));
  });
  await t.test("route and deployment survive a new control-plane process", async () => {
    const child = spawnSync(process.execPath, ["--import", "tsx", "tests/read-serving-route.mts", familyId, deploymentId], {
      env: { ...process.env, DATABASE_URL: testUrl }, cwd: process.cwd(), encoding: "utf8",
    });
    assert.equal(child.status, 0, child.stderr);
    const data = JSON.parse(child.stdout.trim());
    assert.equal(data.activeVersionId, ids.v1);
    assert.equal(data.status, "rolled_back");
  });
  await t.test("failed runtime start persists, then retry recovers", async () => {
    process.env.INFERENCE_RUNTIME_URL = "http://127.0.0.1:1";
    const key = randomUUID();
    const failed = await create(request("/api/deployments", { ...base, idempotencyKey: key }));
    assert.equal(failed.status, 503, await failed.clone().text());
    const record = await prisma.registryDeployment.findUniqueOrThrow({ where: { idempotencyKey: key } });
    assert.equal(record.lifecycleState, "failed");
    assert.ok(record.lastError);
    const failureEvents = (await prisma.deploymentEvent.findMany({ where: { deploymentId: record.id } })).map((item) => item.action);
    assert.ok(failureEvents.includes("preparing"));
    assert.ok(failureEvents.includes("failed"));
    assert.equal((await prediction().catch(() => ({ modelVersion: "unavailable" }))).modelVersion, "unavailable");
    process.env.INFERENCE_RUNTIME_URL = "http://127.0.0.1:8001";
    assert.equal((await prediction()).modelVersion, "v1");
    const recovered = await retry(new Request("http://test", { method: "POST" }), params(record.id));
    assert.equal(recovered.status, 200, await recovered.clone().text());
    assert.equal((await recovered.json()).deployment.lifecycleState, "active");
    const rolled = await rollback(new Request("http://test", { method: "POST" }), params(record.id));
    assert.equal(rolled.status, 200);
  });
  await t.test("concurrent requests create at most one rollout", async () => {
    const responses = await Promise.all([randomUUID(), randomUUID()].map((key) =>
      create(request("/api/deployments", { ...base, idempotencyKey: key }))));
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
    const winner = (await responses.find((response) => response.status === 201)!.json()).deployment.id as string;
    assert.equal((await rollback(new Request("http://test", { method: "POST" }), params(winner))).status, 200);
  });
  await t.test("a fresh process reconciles every interrupted preparation state", async () => {
    for (const lifecycleState of ["pending", "preparing", "starting", "healthy"] as const) {
      const interrupted = await prisma.registryDeployment.create({ data: {
        familyId, stableVersionId: ids.v1, targetVersionId: ids.v2, strategy: "canary",
        trafficPercent: 0, lifecycleState, status: "pending",
        events: { create: { action: lifecycleState, details: {} } },
      } });
      const child = spawnSync(process.execPath, ["--import", "tsx", "tests/reconcile-pending.mts", interrupted.id], {
        env: { ...process.env, DATABASE_URL: testUrl }, cwd: process.cwd(), encoding: "utf8",
      });
      assert.equal(child.status, 0, child.stderr);
      assert.equal(JSON.parse(child.stdout.trim()).lifecycleState, "active");
      assert.equal((await rollback(new Request("http://test", { method: "POST" }), params(interrupted.id))).status, 200);
    }
  });
  assert.equal((await list()).status, 200);
  await prisma.$disconnect();
});
