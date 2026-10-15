"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimeSeriesPoint } from "@/lib/types";

function ChartTooltip({
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
      <p className="text-sm font-semibold text-[var(--secondary)]">{label}</p>
      {payload.map((item) => (
        <p
          key={item.name}
          className="mt-1 text-sm font-medium text-[var(--foreground)]"
        >
          {item.name}: {item.value}
        </p>
      ))}
    </div>
  );
}

export function ThroughputChart({
  data,
  title = "Request throughput - last 30 min",
  subtitle = "Recorded gateway requests",
}: {
  data: TimeSeriesPoint[];
  title?: string;
  subtitle?: string;
}) {
  return (
    <section className="glass-card min-w-0 rounded-lg p-5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-medium tracking-tight text-[var(--foreground)]">
          {title}
        </h2>
        <span className="text-xs font-medium tracking-tight text-[var(--secondary)]">
          {subtitle}
        </span>
      </div>
      <div className="h-[310px] min-w-0 w-full">
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 800, height: 310 }}
        >
          <AreaChart
            data={data}
            margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
          >
            <defs>
              <linearGradient
                id="throughputGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="5%"
                  stopColor="var(--accent)"
                  stopOpacity={0.15}
                />
                <stop
                  offset="95%"
                  stopColor="var(--accent)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--secondary)", fontSize: 12 }}
              minTickGap={45}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: "var(--secondary)", fontSize: 14, fontWeight: 400 }}
              domain={[0, "auto"]}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              isAnimationActive={false}
              type="linear"
              dataKey="throughput"
              name="requests/sec"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="url(#throughputGradient)"
              dot={false}
              activeDot={{
                r: 7,
                fill: "var(--accent)",
                stroke: "var(--foreground)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
