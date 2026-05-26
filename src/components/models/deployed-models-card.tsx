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
    <section className="glass-card rounded-[20px] p-8">
      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-[28px] font-bold tracking-[-0.06em] text-[#f5f3ed]">Deployed models</h2>
        <Link href="/models" className="flex items-center gap-2 text-2xl font-semibold tracking-[-0.05em] text-[#c8c3b9] transition hover:text-[#f5f3ed]">
          View all <ArrowRight className="h-6 w-6" />
        </Link>
      </div>

      <div className="divide-y divide-white/10">
        {models.slice(0, 4).map((model) => (
          <div key={model.id} className="flex items-center justify-between gap-4 py-6 first:pt-0 last:pb-0">
            <div>
              <div className="text-[28px] font-bold leading-none tracking-[-0.06em] text-[#f7f4ee]">{model.name}</div>
              <div className="mt-2 text-[22px] font-semibold leading-none tracking-[-0.05em] text-[#beb9af]">
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
