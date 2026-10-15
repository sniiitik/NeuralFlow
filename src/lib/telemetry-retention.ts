import { getPrisma } from "./prisma";

const DAY_MS = 86_400_000;
let lastPrune = 0;

// Runs at most once per app process per hour. Multiple replicas may run the
// same idempotent deletes; no serving record or model artifact is deleted.
export async function maybePruneTelemetry(now = Date.now()) {
  if (now - lastPrune < 3_600_000) return;
  lastPrune = now;
  const prisma = getPrisma();
  try {
    await Promise.all([
      prisma.inferenceRequest.deleteMany({ where: { createdAt: { lt: new Date(now - 30 * DAY_MS) } } }),
      prisma.runtimeHealthSample.deleteMany({ where: { createdAt: { lt: new Date(now - 30 * DAY_MS) } } }),
      prisma.alertEvent.deleteMany({ where: { createdAt: { lt: new Date(now - 90 * DAY_MS) } } }),
    ]);
  } catch (error) {
    lastPrune = 0;
    console.error("Telemetry retention failed", error);
  }
}
