import type { LucideIcon } from "lucide-react";
export function MetricCard({
  title,
  value,
  suffix,
  trend,
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
    <div className="panel p-4">
      <div className="flex items-center justify-between text-xs muted">
        {title}
        {Icon && <Icon size={14} />}
      </div>
      <div className="mt-3 text-2xl font-medium tracking-tight">
        {value}
        <span className="ml-1 text-sm muted">{suffix}</span>
      </div>
      <p className="mt-2 text-xs muted">{trend}</p>
    </div>
  );
}
