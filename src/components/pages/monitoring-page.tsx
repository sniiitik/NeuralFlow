"use client";

import { AlertTriangle, Activity, Bell, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MetricLineChart } from "@/components/charts/metric-line-chart";
import { PageHeader } from "@/components/ui/page-header";
import { useMetricsStream } from "@/hooks/use-metrics-stream";
import { useTimeSeries } from "@/hooks/use-timeseries";

function AlertCard({ icon: Icon, title, value, helper }: { icon: LucideIcon; title: string; value: string; helper: string }) {
  return (
    <div className="glass-card rounded-[22px] p-5">
      <div className="flex items-center justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.04] text-[#928dff]">
          <Icon className="h-6 w-6" />
        </div>
        <span className="text-3xl font-bold tracking-[-0.07em] text-[#f5f3ed]">{value}</span>
      </div>
      <h3 className="mt-5 text-xl font-bold tracking-[-0.05em] text-[#f5f3ed]">{title}</h3>
      <p className="mt-1 text-sm font-semibold text-[#a9a49a]">{helper}</p>
    </div>
  );
}

export function MonitoringPage() {
  const { snapshot } = useMetricsStream();
  const { series } = useTimeSeries(6000);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Observability"
        title="Monitoring"
        description="Watch live model behavior across latency, throughput, errors, and drift."
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AlertCard icon={Activity} title="Throughput" value={`${snapshot.requestsPerSecond}/s`} helper="Live aggregate request volume" />
        <AlertCard icon={ShieldCheck} title="Latency SLO" value={`${snapshot.avgLatencyMs}ms`} helper="Target is below 80ms" />
        <AlertCard icon={Bell} title="Error budget" value={`${snapshot.errorRate}%`} helper="Nominal production error rate" />
        <AlertCard icon={AlertTriangle} title="Drift alerts" value={`${snapshot.driftAlerts}`} helper="Models above warning threshold" />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MetricLineChart data={series} dataKey="throughput" title="Request throughput" helper="Requests/sec over the last 30 minutes" />
        <MetricLineChart data={series} dataKey="latency" title="Latency" helper="Average inference latency in milliseconds" />
        <MetricLineChart data={series} dataKey="errorRate" title="Error rate" helper="Failed inference requests as a percentage" />
        <MetricLineChart data={series} dataKey="driftScore" title="Drift score" helper="Input distribution drift against baseline" />
      </section>
    </div>
  );
}
