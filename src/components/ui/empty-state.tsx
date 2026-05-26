import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="glass-card flex min-h-[360px] flex-col items-center justify-center rounded-[28px] p-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#6457f6]/15 text-[#928dff]">
        <Icon className="h-8 w-8" />
      </div>
      <h2 className="mt-6 text-2xl font-bold tracking-[-0.04em] text-[#f5f3ed]">{title}</h2>
      <p className="mt-3 max-w-xl text-[#bcb8ad]">{description}</p>
    </div>
  );
}
