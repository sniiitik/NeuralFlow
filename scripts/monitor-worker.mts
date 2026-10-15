import "dotenv/config";
import { setTimeout as delay } from "node:timers/promises";
import { generateSnapshot } from "../src/lib/metrics";
import { getPrisma } from "../src/lib/prisma";

let stopped = false;
const shutdown = new AbortController();
async function run() {
  while (!stopped) {
    try {
      const snapshot = await generateSnapshot();
      console.log(JSON.stringify({ event: "monitor_sample", at: snapshot.generatedAt,
        requests: snapshot.requestCount, alerts: snapshot.alerts.length,
        runtimes: snapshot.runtimeHealth.map((item) => ({ slot: item.slot, healthy: item.healthy })) }));
    } catch (error) {
      console.error("Monitoring worker sample failed", error);
    }
    try { await delay(30_000, undefined, { signal: shutdown.signal }); }
    catch { /* shutdown interrupts the polling interval */ }
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => { stopped = true; shutdown.abort(); });
}
try { await run(); } finally { await getPrisma().$disconnect(); }
