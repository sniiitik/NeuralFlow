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

export function OverviewPage() {
  const { snapshot, connected } = useMetricsStream();
  const { series, loading: seriesLoading, error: seriesError } = useTimeSeries();
  const [models, setModels] = useState<MLModel[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [modelsResponse, deploymentResponse] = await Promise.all([apiClient.getModels(), apiClient.getDeployments()]);
      setModels(modelsResponse.models);
      setDeployments(deploymentResponse.deployments);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load overview data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeDeployment = deployments.find((deployment) => deployment.status === "running" && deployment.strategy === "canary") ?? deployments.find((deployment) => deployment.status === "running");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Deploy and monitor models with zero-downtime rollout workflows."
        action={
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-bold text-[#bcb8ad]">
            {connected ? "Stream connected" : "Polling metrics"}
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard title="Requests / sec" value={snapshot.requestsPerSecond} trend="+ 12% vs 1h ago" icon={Zap} />
        <MetricCard title="Avg latency" value={snapshot.avgLatencyMs} suffix="ms" trend="4ms lower" icon={Gauge} />
        <MetricCard title="Error rate" value={snapshot.errorRate} suffix="%" trend="Nominal" icon={ServerCrash} />
        <MetricCard title="Models live" value={snapshot.modelsLive} trend={`${snapshot.rollingOut} rolling out`} tone="neutral" icon={Activity} />
      </section>

      {error ? <InlineNotice title="Overview data unavailable" message={error} tone="error" /> : null}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DeployedModelsCard models={models} />
        <CanaryRolloutCard deployment={activeDeployment} onChange={load} />
      </section>

      {seriesError ? (
        <InlineNotice title="Metrics chart offline" message={seriesError} tone="error" />
      ) : !seriesLoading && series.length === 0 ? (
        <EmptyState
          icon={Signal}
          title="No throughput samples yet"
          description="Live metric history will appear here once traffic starts flowing through the demo APIs."
        />
      ) : (
        <ThroughputChart data={series} />
      )}

      {loading && !error && models.length === 0 && deployments.length === 0 ? (
        <InlineNotice title="Loading overview" message="Pulling model and deployment state from the local APIs." />
      ) : null}
    </div>
  );
}
