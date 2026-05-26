"use client";

import { Filter, Plus, Search, Boxes } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NewModelModal } from "@/components/models/new-model-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiClient } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";
import type { MLModel, ModelStatus } from "@/lib/types";

const statusFilters: Array<ModelStatus | "all"> = ["all", "live", "canary", "rolling", "shadow"];

export function ModelsPage() {
  const [models, setModels] = useState<MLModel[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<ModelStatus | "all">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getModels()
      .then((response) => {
        setModels(response.models);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to load models.");
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return models.filter((model) => {
      const matchesQuery = [model.name, model.version, model.framework, model.owner]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesStatus = status === "all" || model.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [models, query, status]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Registry"
        title="Models"
        description="Track versions, ownership, runtimes, traffic, and model health in one registry."
        action={
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 rounded-2xl bg-[#6457f6] px-5 py-3 font-bold text-white shadow-lg shadow-[#6457f6]/20 transition hover:bg-[#756bff]">
            <Plus className="h-5 w-5" /> New model
          </button>
        }
      />

      <section className="glass-card rounded-[24px] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8f8b81]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models, versions, owners..."
              className="w-full rounded-2xl border border-white/10 bg-[#1f201d] py-3 pl-12 pr-4 text-[#f5f3ed] outline-none transition placeholder:text-[#77736a] focus:border-[#6457f6]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-5 w-5 text-[#8f8b81]" />
            {statusFilters.map((item) => (
              <button
                key={item}
                onClick={() => setStatus(item)}
                className={`rounded-full px-4 py-2 text-sm font-bold capitalize transition ${status === item ? "bg-[#e8e7ff] text-[#4d4592]" : "bg-white/[0.04] text-[#c9c4b9] hover:bg-white/[0.08]"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error ? <InlineNotice title="Models unavailable" message={error} tone="error" /> : null}

      {loading && models.length === 0 ? (
        <InlineNotice title="Loading models" message="Fetching the registry from your local Prisma-backed API." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={models.length === 0 ? "No models yet" : "No models match this filter"}
          description={
            models.length === 0
              ? "Create the first model in the registry to start tracking versions, traffic, and deployment health."
              : "Try a different search query or status filter to widen the results."
          }
        />
      ) : (
        <section className="glass-card overflow-hidden rounded-[24px]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="border-b border-white/10 bg-white/[0.025] text-sm uppercase tracking-[0.18em] text-[#8f8b81]">
                <tr>
                  <th className="px-6 py-4">Model</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Traffic</th>
                  <th className="px-6 py-4">Latency</th>
                  <th className="px-6 py-4">Error</th>
                  <th className="px-6 py-4">Drift</th>
                  <th className="px-6 py-4">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filtered.map((model) => (
                  <tr key={model.id} className="transition hover:bg-white/[0.025]">
                    <td className="px-6 py-5">
                      <div className="font-bold tracking-[-0.04em] text-[#f5f3ed]">{model.name}</div>
                      <div className="mt-1 text-sm font-semibold text-[#a9a49a]">{model.version} - {model.framework} - {model.owner}</div>
                      {model.artifactName ? <div className="mt-1 text-xs font-semibold text-[#807b72]">artifact: {model.artifactName} ({model.artifactSizeKb} KB)</div> : null}
                    </td>
                    <td className="px-6 py-5"><StatusBadge status={model.status} /></td>
                    <td className="px-6 py-5 font-bold text-[#f5f3ed]">{model.trafficPercent}%</td>
                    <td className="px-6 py-5 font-bold text-[#f5f3ed]">{model.avgLatencyMs}ms</td>
                    <td className="px-6 py-5 font-bold text-[#f5f3ed]">{model.errorRate}%</td>
                    <td className="px-6 py-5 font-bold text-[#f5f3ed]">{model.driftScore}</td>
                    <td className="px-6 py-5 text-[#bcb8ad]">{formatRelativeTime(model.lastDeployedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <NewModelModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(model) => setModels((current) => [model, ...current])}
      />
    </div>
  );
}
