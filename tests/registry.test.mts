import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.slice(1).endsWith("_test")) {
  throw new Error("Set TEST_DATABASE_URL to an isolated database whose name ends in _test.");
}
process.env.DATABASE_URL = testUrl;
process.env.ARTIFACT_STORAGE_DIR = await mkdtemp(path.join(tmpdir(), "neuralflow-artifacts-"));

const { getPrisma } = await import("../src/lib/prisma");
const { POST: registerModel, GET: listModels } = await import("../src/app/api/models/route");
const { GET: getModel, PATCH: patchModel } = await import("../src/app/api/models/[id]/route");
const { POST: uploadArtifact, GET: downloadArtifact } = await import("../src/app/api/models/[id]/artifact/route");
const { POST: createDeployment, GET: listDeployments } = await import("../src/app/api/deployments/route");
const { PATCH: updateTraffic } = await import("../src/app/api/deployments/[id]/traffic/route");
const { POST: promote } = await import("../src/app/api/deployments/[id]/promote/route");
const { POST: rollback } = await import("../src/app/api/deployments/[id]/rollback/route");
const { POST: createFamily } = await import("../src/app/api/families/route");
const { PATCH: patchFamily, DELETE: deleteFamily } = await import("../src/app/api/families/[id]/route");

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function artifactFile(version = "v1") {
  return new File([await readFile(`inference/examples/iris-${version}.json`)], `iris-${version}.json`, { type: "application/json" });
}

test("registry, artifacts, constraints, deployment persistence, and API validation", async (t) => {
  const name = `phase2-${randomUUID()}`;
  const prisma = getPrisma();
  let stableId = "";
  let targetId = "";
  let deploymentId = "";
  const input = { name, framework: "sklearn", owner: "Phase 2 Test", runtime: "cpu-small", replicas: 1 };

  await t.test("registers a family and immutable version", async () => {
    const response = await registerModel(jsonRequest("http://test/api/models", "POST", { ...input, version: "v1" }));
    assert.equal(response.status, 201);
    const { model } = await response.json();
    stableId = model.id;
    assert.equal(model.name, name);
    assert.equal(model.version, "v1");
    assert.equal(model.artifactAvailable, false);
    const detail = await getModel(new Request(`http://test/api/models/${stableId}`), params(stableId));
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).model.id, stableId);
    const listing = await listModels();
    assert.equal(listing.status, 200);
    assert.ok((await listing.json()).models.some((item: { id: string }) => item.id === stableId));
  });

  await t.test("rejects duplicate versions and invalid requests", async () => {
    const duplicate = await registerModel(jsonRequest("http://test/api/models", "POST", { ...input, version: "v1" }));
    assert.equal(duplicate.status, 409);
    const invalid = await registerModel(jsonRequest("http://test/api/models", "POST", { name, version: "v2" }));
    assert.equal(invalid.status, 400);
    const malformed = await registerModel(new Request("http://test/api/models", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }));
    assert.equal(malformed.status, 400);
    const immutableApi = await patchModel(jsonRequest(`http://test/api/models/${stableId}`, "PATCH", { version: "overwritten" }), params(stableId));
    assert.equal(immutableApi.status, 400);
  });

  await t.test("stores, retrieves, and verifies real artifact bytes", async () => {
    const form = new FormData();
    const file = await artifactFile();
    form.append("artifact", file);
    const upload = await uploadArtifact(new Request(`http://test/api/models/${stableId}/artifact`, { method: "POST", body: form }), params(stableId));
    assert.equal(upload.status, 201);
    const second = await uploadArtifact(new Request(`http://test/api/models/${stableId}/artifact`, { method: "POST", body: form }), params(stableId));
    assert.equal(second.status, 409);
    const download = await downloadArtifact(new Request(`http://test/api/models/${stableId}/artifact`), params(stableId));
    assert.equal(download.status, 200);
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.equal(bytes.toString(), await file.text());
    assert.equal(download.headers.get("x-artifact-sha256"), createHash("sha256").update(bytes).digest("hex"));
  });

  await t.test("rejects unsafe formats, bad content, and oversized files", async () => {
    const { validateArtifact, MAX_ARTIFACT_BYTES, retrieveArtifact } = await import("../src/lib/artifact-storage");
    await assert.rejects(() => validateArtifact(new File(["pickle"], "unsafe.pkl")));
    await assert.rejects(() => validateArtifact(new File(["{}"], "bad.json")));
    await assert.rejects(() => validateArtifact(new File([Buffer.alloc(MAX_ARTIFACT_BYTES + 1)], "huge.safetensors")));
    const artifact = await prisma.modelArtifact.findUniqueOrThrow({ where: { versionId: stableId } });
    await assert.rejects(() => retrieveArtifact(artifact.storageKey, "0".repeat(64)));
    const header = Buffer.from(JSON.stringify({ x: { dtype: "F32", shape: [1], data_offsets: [0, 4] } }));
    const length = Buffer.alloc(8);
    length.writeBigUInt64LE(BigInt(header.length));
    const safe = await validateArtifact(new File([length, header, Buffer.alloc(4)], "weights.safetensors"));
    assert.equal(safe.format, "safetensors");
    const invalidHeader = Buffer.from(JSON.stringify({ x: { dtype: "F64", shape: [1], data_offsets: [0, 4] } }));
    const invalidLength = Buffer.alloc(8);
    invalidLength.writeBigUInt64LE(BigInt(invalidHeader.length));
    await assert.rejects(() => validateArtifact(new File([invalidLength, invalidHeader, Buffer.alloc(4)], "bad.safetensors")));
  });

  await t.test("enforces immutable version metadata and database constraints", async () => {
    const version = await prisma.modelVersion.findUniqueOrThrow({ where: { id: stableId } });
    await assert.rejects(() => prisma.$executeRaw`UPDATE "ModelVersion" SET "framework" = 'changed' WHERE "id" = ${stableId}`);
    assert.equal((await prisma.modelVersion.findUniqueOrThrow({ where: { id: stableId } })).framework, version.framework);
    await assert.rejects(() => prisma.modelVersion.create({ data: { familyId: version.familyId, version: "v1", framework: "other" } }));
    await assert.rejects(() => prisma.$executeRaw`UPDATE "ModelArtifact" SET "sha256" = ${"0".repeat(64)} WHERE "versionId" = ${stableId}`);
  });

  await t.test("supports a second version and durable deployment events", async () => {
    const created = await registerModel(jsonRequest("http://test/api/models", "POST", { ...input, version: "v2" }));
    assert.equal(created.status, 201);
    targetId = (await created.json()).model.id;
    const form = new FormData();
    form.append("artifact", await artifactFile("v2"));
    assert.equal((await uploadArtifact(new Request(`http://test/api/models/${targetId}/artifact`, { method: "POST", body: form }), params(targetId))).status, 201);
    const response = await createDeployment(jsonRequest("http://test/api/deployments", "POST", {
      modelId: stableId, fromVersion: "v1", toVersion: "v2", strategy: "canary", trafficPercent: 10,
    }));
    assert.equal(response.status, 201);
    deploymentId = (await response.json()).deployment.id;
    const traffic = await updateTraffic(jsonRequest(`http://test/api/deployments/${deploymentId}/traffic`, "PATCH", { trafficPercent: 35 }), params(deploymentId));
    assert.equal(traffic.status, 200);
    assert.equal((await traffic.json()).deployment.trafficPercent, 35);
    assert.ok((await prisma.deploymentEvent.count({ where: { deploymentId } })) >= 6);
    assert.ok((await listDeployments()).status === 200);
    const invalidTraffic = await updateTraffic(jsonRequest(`http://test/api/deployments/${deploymentId}/traffic`, "PATCH", { trafficPercent: 200 }), params(deploymentId));
    assert.equal(invalidTraffic.status, 400);
    const promoted = await promote(new Request(`http://test/api/deployments/${deploymentId}/promote`, { method: "POST" }), params(deploymentId));
    assert.equal(promoted.status, 200);
    assert.equal((await promoted.json()).deployment.status, "completed");
    assert.equal((await prisma.registryDeployment.findUniqueOrThrow({ where: { id: deploymentId } })).status, "completed");
    assert.ok((await prisma.auditLog.count({ where: { entityId: deploymentId } })) >= 7);
    const again = await promote(new Request(`http://test/api/deployments/${deploymentId}/promote`, { method: "POST" }), params(deploymentId));
    assert.equal(again.status, 200);
  });

  await t.test("persists registry and deployment data across a new process", async () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "tests/read-record.mts", targetId, deploymentId], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testUrl },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const read = JSON.parse(result.stdout.trim());
    assert.equal(read.versionId, targetId);
    assert.equal(read.deploymentId, deploymentId);
  });

  await t.test("records rollback and supports family metadata CRUD", async () => {
    const third = await registerModel(jsonRequest("http://test/api/models", "POST", { ...input, version: "v3" }));
    assert.equal(third.status, 201);
    const form = new FormData();
    form.append("artifact", await artifactFile("v1"));
    const thirdId = (await third.clone().json()).model.id;
    assert.equal((await uploadArtifact(new Request(`http://test/api/models/${thirdId}/artifact`, { method: "POST", body: form }), params(thirdId))).status, 201);
    const created = await createDeployment(jsonRequest("http://test/api/deployments", "POST", {
      modelId: targetId, fromVersion: "v2", toVersion: "v3", strategy: "shadow", trafficPercent: 20,
    }));
    assert.equal(created.status, 201);
    const id = (await created.json()).deployment.id;
    const rolledBack = await rollback(new Request(`http://test/api/deployments/${id}/rollback`, { method: "POST" }), params(id));
    assert.equal(rolledBack.status, 200);
    assert.equal((await rolledBack.json()).deployment.status, "rolled_back");

    const familyName = `empty-${randomUUID()}`;
    const familyResponse = await createFamily(jsonRequest("http://test/api/families", "POST", { name: familyName, owner: "Test" }));
    assert.equal(familyResponse.status, 201);
    const familyId = (await familyResponse.json()).family.id;
    const patched = await patchFamily(jsonRequest(`http://test/api/families/${familyId}`, "PATCH", { owner: "Updated" }), params(familyId));
    assert.equal(patched.status, 200);
    assert.equal((await patched.json()).family.owner, "Updated");
    const deleted = await deleteFamily(new Request(`http://test/api/families/${familyId}`, { method: "DELETE" }), params(familyId));
    assert.equal(deleted.status, 204);
  });

  await prisma.$disconnect();
});
