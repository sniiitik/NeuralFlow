import { getStore } from "./store";
import type { MetricSnapshot, TimeSeriesPoint } from "./types";

function wave(seed: number, amplitude: number, speed = 1) {
  return Math.sin(Date.now() / (1000 * speed) + seed) * amplitude;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 0) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

export function generateSnapshot(): MetricSnapshot {
  const store = getStore();
  const liveModels = store.models.filter((model) => model.status === "live").length;
  const rollingOut = store.deployments.filter((deployment) => deployment.status === "running").length;
  const driftAlerts = store.models.filter((model) => model.driftScore >= 0.25).length;

  const baseRps = store.models.reduce((sum, model) => sum + model.requestsPerSecond, 0);
  const weightedLatency = store.models.reduce((sum, model) => sum + model.avgLatencyMs * Math.max(model.requestsPerSecond, 1), 0);
  const totalRequests = Math.max(baseRps, 1);
  const weightedError = store.models.reduce((sum, model) => sum + model.errorRate * Math.max(model.requestsPerSecond, 1), 0);

  return {
    requestsPerSecond: Math.round(clamp(baseRps + wave(1, 18, 2.8) + wave(2, 8, 1.3), 120, 420)),
    avgLatencyMs: Math.round(clamp(weightedLatency / totalRequests + wave(4, 5, 4.4), 24, 95)),
    errorRate: round(clamp(weightedError / totalRequests + wave(6, 0.08, 5.5), 0.05, 1.4), 2),
    modelsLive: liveModels,
    rollingOut,
    driftAlerts,
    generatedAt: new Date().toISOString(),
  };
}

export function generateTimeSeries(minutes = 30): TimeSeriesPoint[] {
  const now = Date.now();
  return Array.from({ length: minutes }, (_, index) => {
    const pointsFromEnd = minutes - index - 1;
    const timestamp = new Date(now - pointsFromEnd * 60_000);
    const t = index / 2.7;
    const spike = index % 7 === 0 ? 20 : 0;
    const throughput = Math.round(270 + Math.sin(t) * 18 + Math.cos(t * 1.9) * 11 + spike + Math.random() * 8);
    const latency = Math.round(42 + Math.cos(t * 0.9) * 7 + Math.sin(t * 1.7) * 4 + Math.random() * 4);
    const errorRate = round(clamp(0.28 + Math.sin(t * 1.2) * 0.09 + Math.random() * 0.06, 0.08, 0.9), 2);
    const driftScore = round(clamp(0.13 + Math.cos(t * 0.65) * 0.05 + Math.random() * 0.04, 0.04, 0.35), 2);

    return {
      timestamp: timestamp.toISOString(),
      label: timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      throughput,
      latency,
      errorRate,
      driftScore,
    };
  });
}
