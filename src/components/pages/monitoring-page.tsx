"use client";

import { Activity } from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { MetricLineChart } from "@/components/charts/metric-line-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { useMetricsStream } from "@/hooks/use-metrics-stream";
import { useTimeSeries } from "@/hooks/use-timeseries";

export function MonitoringPage() {
  const { snapshot, connected, error } = useMetricsStream();
  const { series, loading, error: seriesError } = useTimeSeries(6000);
  const value = (amount: number | null | undefined, suffix: string) =>
    amount == null ? "—" : `${amount}${suffix}`;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Observability"
        title="Monitoring"
        description="Recorded gateway traffic, runtime health, SLOs, and input drift."
        action={
          <span className="text-sm text-[var(--secondary)]">
            {connected ? "Live stream" : "Polling / reconnecting"}
          </span>
        }
      />

      {error ? (
        <InlineNotice
          title="Metrics disconnected"
          message="The stream and polling updates are unavailable. Displayed values may be stale."
          tone="error"
        />
      ) : null}
      {!snapshot && !error ? (
        <InlineNotice
          title="Loading monitoring"
          message="Reading persisted inference events and checking both runtimes."
        />
      ) : null}
      {snapshot && !snapshot.hasData ? (
        <EmptyState
          icon={Activity}
          title="No requests in the last five minutes"
          description="Send a real inference request to populate operational metrics. No sample values are shown."
        />
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <MetricCard
          title="Requests"
          value={snapshot?.requestCount ?? "—"}
          trend={`${snapshot?.demoRequests ?? 0} demo · 5 minutes`}
        />
        <MetricCard
          title="Throughput"
          value={value(snapshot?.requestsPerSecond, "/s")}
          trend="5-minute average"
        />
        <MetricCard
          title="Error rate"
          value={value(snapshot?.errorRate, "%")}
          trend={`${snapshot?.failedCount ?? 0} failed requests`}
        />
        <MetricCard
          title="P50 latency"
          value={value(snapshot?.p50LatencyMs, " ms")}
          trend="5-minute window"
        />
        <MetricCard
          title="P95 latency"
          value={value(snapshot?.p95LatencyMs, " ms")}
          trend="5-minute window"
        />
        <MetricCard
          title="P99 latency"
          value={value(snapshot?.p99LatencyMs, " ms")}
          trend="5-minute window"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MetricLineChart
          data={series}
          dataKey="throughput"
          title="Request throughput"
          helper="Completed primary requests/sec per minute, last 30 minutes"
        />
        <MetricLineChart
          data={series}
          dataKey="latency"
          title="Gateway latency"
          helper="Mean successful gateway latency in milliseconds"
        />
        <MetricLineChart
          data={series}
          dataKey="errorRate"
          title="Error rate"
          helper="Failed primary requests as a percentage"
        />
        <MetricLineChart
          data={series}
          dataKey="driftScore"
          title="Input drift trend"
          helper="Maximum standardized mean shift, where ≥30 samples are available"
        />
      </section>
      {seriesError ? (
        <InlineNotice
          title="Metric history unavailable"
          message={seriesError}
          tone="error"
        />
      ) : null}
      {!loading && !seriesError && series.length === 0 ? (
        <InlineNotice
          title="No chart data"
          message="Charts remain empty until actual inference requests are recorded."
        />
      ) : null}

      {snapshot ? (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="glass-card rounded-lg p-6">
            <h2 className="text-sm font-medium text-[var(--foreground)]">
              SLO and runtime health
            </h2>
            <p className="mt-3 text-sm text-[var(--secondary)]">
              Five-minute success: {value(snapshot.slo.successPercent, "%")}
              {snapshot.slo.successMet === null
                ? " (no data)"
                : snapshot.slo.successMet
                  ? " (meeting target)"
                  : " (breached)"}
            </p>
            <p className="mt-2 break-all text-sm text-[var(--secondary)]">
              Five-minute p95: {value(snapshot.p95LatencyMs, "ms")}
              {snapshot.slo.latencyMet === null
                ? " (no data)"
                : snapshot.slo.latencyMet
                  ? " (meeting target)"
                  : " (breached)"}
            </p>
            {snapshot.runtimeHealth.map((runtime) => (
              <p
                key={runtime.slot}
                className="mt-2 break-all text-sm text-[var(--secondary)]"
              >
                {runtime.slot}:{" "}
                {runtime.healthy
                  ? `ready (${runtime.latencyMs}ms probe)`
                  : `unhealthy (${runtime.errorCode})`}
              </p>
            ))}
          </div>
          <div className="glass-card rounded-lg p-6">
            <h2 className="text-sm font-medium text-[var(--foreground)]">
              Observed traffic by version
            </h2>
            {snapshot.distribution.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--secondary)]">
                No recent routed requests.
              </p>
            ) : (
              snapshot.distribution.map((row) => (
                <p
                  key={`${row.versionId}:${row.source}`}
                  className="mt-2 break-all text-sm text-[var(--secondary)]"
                >
                  {row.versionId}: {row.requests}{" "}
                  {row.source === "demo" ? "demo requests" : "requests"}
                </p>
              ))
            )}
          </div>
          <div className="glass-card rounded-lg p-6">
            <h2 className="text-sm font-medium text-[var(--foreground)]">
              Input data drift
            </h2>
            <p className="mt-2 break-all text-sm text-[var(--secondary)]">
              Compares observed Iris features with training scaler reference
              means and scales. This is data drift, not predictive accuracy.
            </p>
            {snapshot.drift.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--secondary)]">
                No feature samples in the last hour.
              </p>
            ) : (
              snapshot.drift.map((row) => (
                <p
                  key={row.versionId}
                  className="mt-2 break-all text-sm text-[var(--secondary)]"
                >
                  {row.versionId}:{" "}
                  {row.score == null
                    ? `insufficient samples (${row.sampleCount}/${row.minimumSamples})`
                    : `score ${row.score} from ${row.sampleCount} samples`}
                </p>
              ))
            )}
          </div>
          <div className="glass-card rounded-lg p-6">
            <h2 className="text-sm font-medium text-[var(--foreground)]">
              Recent alert events
            </h2>
            {snapshot.alerts.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--secondary)]">
                No alerts in the last 24 hours.
              </p>
            ) : (
              snapshot.alerts.map((alert) => (
                <p
                  key={alert.id}
                  className="mt-2 break-all text-sm text-[var(--secondary)]"
                >
                  {new Date(alert.createdAt).toLocaleString()}: {alert.message}{" "}
                  ({alert.observed} / {alert.threshold})
                </p>
              ))
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
