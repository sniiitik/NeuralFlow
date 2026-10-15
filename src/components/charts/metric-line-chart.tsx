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

const labels: Record<
  keyof Pick<
    TimeSeriesPoint,
    "throughput" | "latency" | "errorRate" | "driftScore"
  >,
  string
> = {
  throughput: "Requests/sec",
  latency: "Latency ms",
  errorRate: "Error rate %",
  driftScore: "Drift score",
};

function TooltipBox({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-[var(--surface)]/95 px-4 py-3 shadow-2xl backdrop-blur">
      <p className="text-xs text-[var(--secondary)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
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
  dataKey: keyof Pick<
    TimeSeriesPoint,
    "throughput" | "latency" | "errorRate" | "driftScore"
  >;
  title: string;
  helper: string;
}) {
  return (
    <section className="glass-card min-w-0 rounded-lg p-6">
      <div className="mb-4">
        <h3 className="text-sm font-medium tracking-tight text-[var(--foreground)]">
          {title}
        </h3>
        <p className="mt-1 text-xs text-[var(--secondary)]">
          {helper}
        </p>
      </div>
      <div className="h-[230px] min-w-0">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 500, height: 230 }}
        >
          <LineChart
            data={data}
            margin={{ left: 0, right: 8, top: 10, bottom: 0 }}
          >
            <CartesianGrid stroke="rgba(255,255,255,0.08)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--secondary)", fontSize: 11 }}
              minTickGap={45}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "var(--secondary)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={50}
            />
            <Tooltip content={<TooltipBox />} />
            <Line
              isAnimationActive={false}
              type="linear"
              dataKey={dataKey}
              name={labels[dataKey]}
              stroke="var(--accent-text)"
              strokeWidth={2}
              dot={{r:2,strokeWidth:0}}
              activeDot={{
                r: 6,
                fill: "var(--accent-text)",
                stroke: "var(--foreground)",
                strokeWidth: 2,
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
