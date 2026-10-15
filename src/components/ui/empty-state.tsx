import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="glass-card flex min-h-[200px] flex-col items-center justify-center rounded-lg p-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent-text)]">
        <Icon className="h-8 w-8" />
      </div>
      <h2 className="mt-6 text-lg font-medium tracking-tight text-[var(--foreground)]">
        {title}
      </h2>
      <p className="mt-3 max-w-xl text-[var(--secondary)]">{description}</p>
    </div>
  );
}
