"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { MetricSnapshot } from "@/lib/types";

const fallbackSnapshot: MetricSnapshot = {
  requestsPerSecond: 289,
  avgLatencyMs: 42,
  errorRate: 0.3,
  modelsLive: 6,
  rollingOut: 2,
  driftAlerts: 1,
  generatedAt: new Date().toISOString(),
};

export function useMetricsStream() {
  const [snapshot, setSnapshot] = useState<MetricSnapshot>(fallbackSnapshot);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const source = new EventSource("/api/metrics/stream");

    source.onopen = () => setConnected(true);
    source.onmessage = (event) => {
      setSnapshot(JSON.parse(event.data) as MetricSnapshot);
    };
    source.onerror = () => {
      source.close();
      setConnected(false);

      interval = setInterval(async () => {
        try {
          const next = await apiClient.getSnapshot();
          if (!closed) setSnapshot(next);
        } catch {
          // Keep the previous snapshot if polling fails.
        }
      }, 2500);
    };

    return () => {
      closed = true;
      source.close();
      if (interval) clearInterval(interval);
    };
  }, []);

  return { snapshot, connected };
}
