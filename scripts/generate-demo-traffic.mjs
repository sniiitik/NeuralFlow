import { readFile } from "node:fs/promises";
import { client } from "./demo-common.mjs";
import { randomUUID } from "node:crypto";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, "").split("=", 2);
  return [key, value];
}));
const base = new URL(args.url ?? process.env.DEMO_BASE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
if (!["127.0.0.1", "localhost"].includes(base.hostname)) throw new Error("Demo traffic is limited to a local gateway.");
const count = Number(args.count ?? 100);
const rate = Number(args.rate ?? 1);
if (!Number.isInteger(count) || count < 1 || count > 1000 || !Number.isInteger(rate) || rate < 1 || rate > 1)
  throw new Error("Use --count=1..1000 and --rate=1 (respects the authenticated gateway limit) requests per second.");
// Authenticate with the local administrator/operator account; telemetry is recorded as ordinary user traffic.
if (base.origin !== new URL(process.env.DEMO_BASE_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').origin) throw new Error('Use DEMO_BASE_URL matching the server origin.');
const api = await client();
let familyId = args.family;
if (!familyId) { try { familyId = JSON.parse(await readFile('var/demo/state.json','utf8')).familyId; } catch { throw new Error('Run npm run demo:setup or pass --family=<id>.'); } }
const samples = [
  { sepal_length: 5.1, sepal_width: 3.5, petal_length: 1.4, petal_width: 0.2 },
  { sepal_length: 6.0, sepal_width: 2.9, petal_length: 4.5, petal_width: 1.5 },
  { sepal_length: 6.7, sepal_width: 3.0, petal_length: 5.2, petal_width: 2.3 },
];
const versions = {};
let successes = 0;
let failures = 0;
for (let index = 0; index < count; index++) {
  const response = await api.request('/api/inference/predict', {
    method: 'POST', headers: {'Content-Type':'application/json','X-Request-ID':`demo-${randomUUID()}`},
    body: JSON.stringify({familyId, features:samples[index % samples.length]}),
  });
  const body = await response.json();
  if (response.ok && body.modelVersionId && body.prediction) { successes++; versions[body.modelVersion]=(versions[body.modelVersion]??0)+1; }
  else { failures++; console.error(`Request ${index + 1}: ${response.status} ${JSON.stringify(body)}`); }
  if (index < count - 1) await new Promise((resolve) => setTimeout(resolve, 1000 / rate));
}
console.log(`Sent ${count} real gateway requests for ${familyId}: ${successes} successful, ${failures} failed.`);
console.log("Observed serving versions:", JSON.stringify(versions));
if (failures) process.exitCode = 1;
