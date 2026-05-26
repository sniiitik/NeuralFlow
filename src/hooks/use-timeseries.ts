"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { TimeSeriesPoint } from "@/lib/types";

export function useTimeSeries(refreshMs = 8000) {
  const [series, setSeries] = useState<TimeSeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await apiClient.getTimeSeries();
        if (active) {
          setSeries(response.series);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load time-series metrics.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, refreshMs);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refreshMs]);

  return { series, loading, error };
}
