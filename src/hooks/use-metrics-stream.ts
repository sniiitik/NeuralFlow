"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { MetricSnapshot } from "@/lib/types";

export function useMetricsStream() {
  const [snapshot, setSnapshot] = useState<MetricSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    const source = new EventSource("/api/metrics/stream");

    source.onopen = () => { setConnected(true); setError(false); };
    source.onmessage = (event) => {
      setSnapshot(JSON.parse(event.data) as MetricSnapshot);
      setError(false);
    };
    source.onerror = () => {
      source.close();
      setConnected(false);
      setError(true);

      interval = setInterval(async () => {
        try {
          const next = await apiClient.getSnapshot();
          if (!closed) { setSnapshot(next); setError(false); }
        } catch {
          if (!closed) setError(true);
        }
      }, 2500);
    };

    return () => {
      closed = true;
      source.close();
      if (interval) clearInterval(interval);
    };
  }, []);

  return { snapshot, connected, error };
}
