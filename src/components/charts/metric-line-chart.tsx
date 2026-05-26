"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimeSeriesPoint } from "@/lib/types";

const labels: Record<keyof Pick<TimeSeriesPoint, "throughput" | "latency" | "errorRate" | "driftScore">, string> = {
  throughput: "Requests/sec",
  latency: "Latency ms",
  errorRate: "Error rate %",
  driftScore: "Drift score",
};

function TooltipBox({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#1f201d]/95 px-4 py-3 shadow-2xl backdrop-blur">
      <p className="text-sm font-semibold text-[#bcb8ad]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[#f5f3ed]">
        {payload[0].name}: {payload[0].value}
      </p>
    </div>
  );
}

export function MetricLineChart({
  data,
  dataKey,
  title,
  helper,
}: {
  data: TimeSeriesPoint[];
  dataKey: keyof Pick<TimeSeriesPoint, "throughput" | "latency" | "errorRate" | "driftScore">;
  title: string;
  helper: string;
}) {
  return (
    <section className="glass-card min-w-0 rounded-[24px] p-6">
      <div className="mb-4">
        <h3 className="text-2xl font-bold tracking-[-0.05em] text-[#f5f3ed]">{title}</h3>
        <p className="mt-1 text-sm font-semibold text-[#9b978d]">{helper}</p>
      </div>
      <div className="h-[230px] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" />
            <XAxis dataKey="label" tick={{ fill: "#8f8b81", fontSize: 11 }} interval={5} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#8f8b81", fontSize: 12 }} tickLine={false} axisLine={false} width={36} />
            <Tooltip content={<TooltipBox />} />
            <Line
              type="monotone"
              dataKey={dataKey}
              name={labels[dataKey]}
              stroke="#928dff"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: "#928dff", stroke: "#f5f3ed", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
