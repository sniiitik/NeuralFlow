import Link from "next/link";
import { ArrowRight, Boxes } from "lucide-react";
import type { MLModel } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

export function DeployedModelsCard({ models }: { models: MLModel[] }) {
  if (models.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="No models in the registry"
        description="Create your first model version to populate the overview and unlock deployment flows."
      />
    );
  }

  return (
    <section className="glass-card rounded-lg p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium tracking-tight text-[var(--foreground)]">
          Registered versions
        </h2>
        <Link
          href="/models"
          className="flex items-center gap-2 text-xs font-semibold tracking-tight text-[var(--secondary)] transition hover:text-[var(--foreground)]"
        >
          View all <ArrowRight className="h-6 w-6" />
        </Link>
      </div>

      <div className="divide-y divide-white/10">
        {models.slice(0, 4).map((model) => (
          <div
            key={model.id}
            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <div>
              <div className="text-sm font-medium leading-none tracking-tight text-[var(--secondary)]">
                {model.name}
              </div>
              <div className="mt-2 text-sm font-semibold leading-none tracking-tight text-[var(--secondary)]">
                {model.version} - {model.framework}
              </div>
            </div>
            <StatusBadge status={model.status} />
          </div>
        ))}
      </div>
    </section>
  );
}
