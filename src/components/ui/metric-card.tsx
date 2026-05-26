import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

export function MetricCard({
  title,
  value,
  suffix,
  trend,
  tone = "green",
  icon: Icon,
}: {
  title: string;
  value: string | number;
  suffix?: string;
  trend: string;
  tone?: "green" | "purple" | "neutral";
  icon?: LucideIcon;
}) {
  return (
    <div className="group relative overflow-hidden rounded-[16px] bg-[#20211e] p-7 shadow-xl shadow-black/10 transition hover:-translate-y-0.5 hover:bg-[#242520]">
      <div className="absolute right-4 top-4 opacity-0 transition group-hover:opacity-100">
        {Icon ? <Icon className="h-5 w-5 text-white/20" /> : null}
      </div>
      <div className="text-[22px] font-bold uppercase leading-[1.05] tracking-[-0.03em] text-[#c2beb4]">{title}</div>
      <div className="mt-3 flex items-end gap-1">
        <span className="text-[48px] font-bold leading-none tracking-[-0.08em] text-[#f8f5ed]">{value}</span>
        {suffix ? <span className="mb-1 text-2xl font-bold tracking-[-0.05em] text-[#f8f5ed]">{suffix}</span> : null}
      </div>
      <div
        className={clsx(
          "mt-3 text-xl font-bold tracking-[-0.04em]",
          tone === "green" && "text-[#85c94f]",
          tone === "purple" && "text-[#928dff]",
          tone === "neutral" && "text-[#c5c0b7]"
        )}
      >
        {trend}
      </div>
    </div>
  );
}
