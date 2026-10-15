"use client";

import { Activity, Gauge, ServerCrash, Signal, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ThroughputChart } from "@/components/charts/throughput-chart";
import { CanaryRolloutCard } from "@/components/deployments/canary-rollout-card";
import { DeployedModelsCard } from "@/components/models/deployed-models-card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineNotice } from "@/components/ui/inline-notice";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { useMetricsStream } from "@/hooks/use-metrics-stream";
import { useTimeSeries } from "@/hooks/use-timeseries";
import { apiClient } from "@/lib/api-client";
import type { Deployment, MLModel } from "@/lib/types";

export function OverviewPage({
  events = [],
}: {
  events?: {
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
  }[];
}) {
  const { snapshot, connected, error: metricsError } = useMetricsStream();
  const {
    series,
    loading: seriesLoading,
    error: seriesError,
  } = useTimeSeries();
  const [models, setModels] = useState<MLModel[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [modelsResponse, deploymentResponse] = await Promise.all([
        apiClient.getModels(),
        apiClient.getDeployments(),
      ]);
      setModels(modelsResponse.models);
      setDeployments(deploymentResponse.deployments);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load overview data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([apiClient.getModels(), apiClient.getDeployments()])
      .then(([modelsResponse, deploymentResponse]) => {
        if (!active) return;
        setModels(modelsResponse.models);
        setDeployments(deploymentResponse.deployments);
        setError(null);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load overview data.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeDeployment =
    deployments.find(
      (deployment) =>
        deployment.status === "running" && deployment.strategy === "canary",
    ) ?? deployments.find((deployment) => deployment.status === "running");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Your models, serving health, and real inference activity at a glance."
        action={
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-[var(--secondary)]">
            {connected ? "Stream connected" : "Polling metrics"}
            {snapshot
              ? ` · ${new Date(snapshot.generatedAt).toLocaleTimeString()}`
              : ""}
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="Requests / sec"
          value={snapshot?.requestsPerSecond ?? "—"}
          trend="Observed over 5 minutes"
          icon={Zap}
        />
        <MetricCard
          title="P95 latency"
          value={snapshot?.p95LatencyMs ?? "—"}
          suffix="ms"
          trend="Observed gateway time"
          icon={Gauge}
        />
        <MetricCard
          title="Error rate"
          value={snapshot?.errorRate ?? "—"}
          suffix="%"
          trend="Observed over 5 minutes"
          icon={ServerCrash}
        />
        <MetricCard
          title="Total requests"
          value={snapshot?.requestCount ?? "—"}
          trend="Last 5 minutes"
        />
        <MetricCard
          title="Healthy runtimes"
          value={
            snapshot
              ? snapshot.runtimeHealth.filter((r) => r.healthy).length
              : "—"
          }
          trend="Latest readiness probes"
        />
        <MetricCard
          title="Serving families"
          value={snapshot?.modelsLive ?? "—"}
          trend={`${snapshot?.rollingOut ?? 0} rolling out`}
          tone="neutral"
          icon={Activity}
        />
      </section>

      {metricsError ? (
        <InlineNotice
          title="Metrics disconnected"
          message="Live metrics are unavailable. Retrying by polling."
          tone="error"
        />
      ) : null}
      {!snapshot && !metricsError ? (
        <InlineNotice
          title="Loading metrics"
          message="Reading persisted inference activity."
        />
      ) : null}
      {snapshot && !snapshot.hasData ? (
        <InlineNotice
          title="No recent inference activity"
          message="Send a prediction to populate the five-minute monitoring window."
        />
      ) : null}

      {error ? (
        <InlineNotice
          title="Overview data unavailable"
          message={error}
          tone="error"
        />
      ) : null}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DeployedModelsCard models={models} />
        <CanaryRolloutCard deployment={activeDeployment} onChange={load} />
      </section>

      {seriesError ? (
        <InlineNotice
          title="Metrics chart offline"
          message={seriesError}
          tone="error"
        />
      ) : !seriesLoading && series.length === 0 ? (
        <EmptyState
          icon={Signal}
          title="No throughput samples yet"
          description="Observed throughput appears after real predictions reach the inference gateway."
        />
      ) : (
        <ThroughputChart data={series} subtitle="All recorded model versions" />
      )}

      <section className="panel p-5">
        <div className="flex justify-between">
          <h2 className="font-medium">Recent activity</h2>
          <a href="/audit" className="text-xs muted hover:underline">
            View audit history →
          </a>
        </div>
        {events.length ? (
          <ul className="mt-4 divide-y divide-[var(--border)]">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap justify-between gap-2 py-3"
              >
                <div>
                  <p className="text-sm">
                    {e.action.replaceAll("_", " ").replaceAll(".", " · ")}
                  </p>
                  <p className="text-xs muted">{e.entityType}</p>
                </div>
                <time className="text-xs muted" title={e.createdAt}>
                  {e.createdAt.replace("T", " ").slice(0, 19)} UTC
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-5 text-sm muted">
            No operational events recorded yet.
          </p>
        )}
        <p className="mt-2 text-xs muted">
          Activity captured when this page loaded.
        </p>
      </section>
      {loading && !error && models.length === 0 && deployments.length === 0 ? (
        <InlineNotice
          title="Loading overview"
          message="Pulling model and deployment state from the local APIs."
        />
      ) : null}
    </div>
  );
}
