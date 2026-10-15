import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const url = process.env.SECURITY_TEST_BASE_URL;
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!url || !databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error("Set SECURITY_TEST_BASE_URL and isolated TEST_DATABASE_URL ending in _test.");
}
process.env.DATABASE_URL = databaseUrl;
process.env.NEURALFLOW_BOOTSTRAP = "1";
const { auth } = await import("../src/lib/auth");
const { getPrisma } = await import("../src/lib/prisma");
const prisma = getPrisma();
const base = new URL(url);
const password = "phase7-integration-password-2026";

async function account(role: "viewer" | "operator" | "demo") {
  const email = `${role}-${randomUUID()}@example.test`;
  const created = await auth.api.signUpEmail({ body: { name: role, email, password } });
  await prisma.user.update({ where: { id: created.user.id }, data: { role, emailVerified: true } });
  const login = await fetch(new URL("/api/auth/sign-in/email", base), {
    method: "POST", headers: { "Content-Type": "application/json", Origin: base.origin },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
  assert.ok(cookie);
  return cookie;
}

test("public HTTP boundary denies unauthenticated requests and enforces roles", async () => {
  const anonymous = await fetch(new URL("/api/models", base));
  assert.equal(anonymous.status, 401);
  const spoof = await fetch(new URL("/api/inference/predict", base), { method: "POST",
    headers: { "Content-Type": "application/json", "X-NeuralFlow-Trusted-Role": "admin", "X-NeuralFlow-Traffic-Source": "demo" }, body: "{}" });
  assert.equal(spoof.status, 401);
  const viewer = await account("viewer");
  assert.equal((await fetch(new URL("/api/models", base), { headers: { Cookie: viewer } })).status, 200);
  assert.equal((await fetch(new URL("/api/models", base), { method: "POST", headers: { Cookie: viewer, Origin: base.origin,
    "Content-Type": "application/json" }, body: "{}" })).status, 403);
  const operator = await account("operator");
  assert.equal((await fetch(new URL("/api/models", base), { method: "POST", headers: { Cookie: operator, Origin: "https://evil.example",
    "Content-Type": "application/json" }, body: "{}" })).status, 403);
  const validOperator = await fetch(new URL("/api/models", base), { method: "POST", headers: { Cookie: operator, Origin: base.origin,
    "Content-Type": "application/json" }, body: "{}" });
  assert.equal(validOperator.status, 400, JSON.stringify(await validOperator.json()));
  const demo = await account("demo");
  assert.equal((await fetch(new URL("/api/models", base), { headers: { Cookie: demo } })).status, 403);
  assert.equal((await fetch(new URL("/api/inference/predict", base), { method: "POST", headers: { Cookie: demo, Origin: base.origin,
    "Content-Type": "application/json", "X-NeuralFlow-Trusted-Role": "admin" }, body: "{}" })).status, 400);
  const familyName = `security-lifecycle-${randomUUID()}`;
  const versions: Record<string, string> = {};
  let familyId = "";
  for (const version of ["v1", "v2"]) {
    const form = new FormData();
    form.set("name", familyName);
    form.set("version", version);
    form.set("framework", "sklearn");
    form.set("owner", "security-test");
    form.set("artifact", new File([await readFile(`inference/examples/iris-${version}.json`)], `${version}.json`, { type: "application/json" }));
    const registered = await fetch(new URL("/api/models", base), { method: "POST", headers: { Cookie: operator, Origin: base.origin }, body: form });
    assert.equal(registered.status, 201, await registered.clone().text());
    const body = await registered.json();
    versions[version] = body.model.id;
    familyId = body.model.familyId;
  }
  const activate = await fetch(new URL("/api/inference/deployments", base), { method: "POST", headers: {
    Cookie: operator, Origin: base.origin, "Content-Type": "application/json",
  }, body: JSON.stringify({ versionId: versions.v1 }) });
  assert.equal(activate.status, 201, await activate.clone().text());
  const predictionBody = JSON.stringify({ familyId, features: {
    sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2,
  } });
  const operatorPrediction = async () => {
    const response = await fetch(new URL("/api/inference/predict", base), { method: "POST", headers: {
      Cookie: operator, Origin: base.origin, "Content-Type": "application/json",
    }, body: predictionBody });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  assert.equal((await operatorPrediction()).modelVersionId, versions.v1);
  const deployment = await fetch(new URL("/api/deployments", base), { method: "POST", headers: {
    Cookie: operator, Origin: base.origin, "Content-Type": "application/json",
  }, body: JSON.stringify({ modelId: versions.v1, fromVersion: "v1", toVersion: "v2", strategy: "canary",
    trafficPercent: 10, idempotencyKey: randomUUID() }) });
  assert.equal(deployment.status, 201, await deployment.clone().text());
  const deploymentId = (await deployment.json()).deployment.id;
  const promotion = await fetch(new URL(`/api/deployments/${deploymentId}/promote`, base), { method: "POST", headers: {
    Cookie: operator, Origin: base.origin,
  } });
  assert.equal(promotion.status, 200, await promotion.clone().text());
  assert.equal((await operatorPrediction()).modelVersionId, versions.v2);
  const rollback = await fetch(new URL(`/api/deployments/${deploymentId}/rollback`, base), { method: "POST", headers: {
    Cookie: operator, Origin: base.origin,
  } });
  assert.equal(rollback.status, 200, await rollback.clone().text());
  assert.equal((await operatorPrediction()).modelVersionId, versions.v1);
  for (const [cookie, source] of [[demo, "demo"], [viewer, "user"]] as const) {
    const response = await fetch(new URL("/api/inference/predict", base), { method: "POST", headers: {
      Cookie: cookie, Origin: base.origin, "Content-Type": "application/json",
      "X-NeuralFlow-Traffic-Source": "demo", "X-NeuralFlow-Trusted-Role": "admin",
    }, body: predictionBody });
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    assert.ok(result.prediction && result.modelVersionId);
    const record = await prisma.inferenceRequest.findFirstOrThrow({ where: { requestId: result.requestId, role: { not: "shadow" } },
      orderBy: { createdAt: "desc" } });
    assert.equal(record.source, source);
  }
  const intruderEmail = `intruder-${randomUUID()}@example.test`;
  const signUp = await fetch(new URL("/api/auth/sign-up/email", base), { method: "POST", headers: { "Content-Type": "application/json", Origin: base.origin },
    body: JSON.stringify({ name: "intruder", email: intruderEmail, password }) });
  assert.ok(signUp.status >= 400);
  assert.equal(await prisma.user.count({ where: { email: intruderEmail } }), 0);
  assert.equal(anonymous.headers.get("x-content-type-options"), "nosniff");
  assert.equal(anonymous.headers.get("x-frame-options"), "DENY");
  assert.ok(await prisma.auditLog.count({ where: { action: "security.denied" } }) >= 1);
  assert.ok(await prisma.auditLog.count({ where: { action: "security.control_request" } }) >= 1);
});
