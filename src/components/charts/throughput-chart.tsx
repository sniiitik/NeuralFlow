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

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string }>; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1f201d]/95 px-4 py-3 shadow-2xl backdrop-blur">
      <p className="text-sm font-semibold text-[#bcb8ad]">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="mt-1 text-sm font-bold text-[#f5f3ed]">
          {item.name}: {item.value}
        </p>
      ))}
    </div>
  );
}

export function ThroughputChart({ data, title = "Request throughput - last 30 min", subtitle = "fraud-detector - v2.4.1" }: { data: TimeSeriesPoint[]; title?: string; subtitle?: string }) {
  return (
    <section className="glass-card min-w-0 rounded-[20px] p-7">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[28px] font-bold tracking-[-0.06em] text-[#f5f3ed]">{title}</h2>
        <span className="text-xl font-bold tracking-[-0.04em] text-[#c7c2b8]">{subtitle}</span>
      </div>
      <div className="h-[310px] min-w-0 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="throughputGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6457f6" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#6457f6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={true} />
            <XAxis dataKey="label" tick={{ fill: "#8f8b81", fontSize: 12 }} interval={4} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#8f8b81", fontSize: 14, fontWeight: 700 }} domain={[240, 330]} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="throughput"
              name="requests/sec"
              stroke="#6457f6"
              strokeWidth={3}
              fill="url(#throughputGradient)"
              dot={false}
              activeDot={{ r: 7, fill: "#6457f6", stroke: "#f5f3ed", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
