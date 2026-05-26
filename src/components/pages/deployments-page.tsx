"use client";

import { ArrowUpRight, RotateCcw, Rocket, Send } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { apiClient } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";
import type { Deployment, DeploymentStrategy, MLModel } from "@/lib/types";

export function DeploymentsPage() {
  const [models, setModels] = useState<MLModel[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [traffic, setTraffic] = useState(10);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [modelResponse, deploymentResponse] = await Promise.all([apiClient.getModels(), apiClient.getDeployments()]);
      setModels(modelResponse.models);
      setDeployments(deploymentResponse.deployments);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load deployment data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const firstModel = models[0];
  const activeDeployments = useMemo(() => deployments.filter((deployment) => deployment.status === "running"), [deployments]);

  async function createDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const modelId = String(form.get("modelId") || firstModel?.id || "");
    const model = models.find((item) => item.id === modelId);
    const strategy = String(form.get("strategy")) as DeploymentStrategy;
    const toVersion = String(form.get("toVersion"));

    if (!model || !toVersion) return;

    setPending(true);
    try {
      await apiClient.createDeployment({
        modelId,
        fromVersion: model.version,
        toVersion,
        strategy,
        trafficPercent: traffic,
      });
      await load();
      event.currentTarget.reset();
      setTraffic(10);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create deployment.");
    } finally {
      setPending(false);
    }
  }

  async function updateTraffic(id: string, value: number) {
    try {
      await apiClient.updateTraffic(id, value);
      await load();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update traffic split.");
    }
  }

  async function promote(id: string) {
    try {
      await apiClient.promoteDeployment(id);
      await load();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to promote deployment.");
    }
  }

  async function rollback(id: string) {
    try {
      await apiClient.rollbackDeployment(id);
      await load();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to roll back deployment.");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Release control"
        title="Deployments"
        description="Create canary, blue-green, and shadow rollouts with traffic controls and rollback actions."
      />

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={createDeployment} className="glass-card rounded-[28px] p-6">
          <h2 className="text-3xl font-bold tracking-[-0.06em] text-[#f5f3ed]">New rollout</h2>
          <p className="mt-2 text-[#bcb8ad]">Simulate the deployment flow that production ML teams use.</p>

          {error ? <div className="mt-5"><InlineNotice title="Deployment action failed" message={error} tone="error" /></div> : null}
          {loading && !error ? <div className="mt-5"><InlineNotice title="Loading deployments" message="Fetching registered models and active rollout state." /></div> : null}

          <div className="mt-6 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f8b81]">Model</span>
              <select name="modelId" className="w-full rounded-2xl border border-white/10 bg-[#1f201d] px-4 py-3 text-[#f5f3ed] outline-none focus:border-[#6457f6]">
                {models.map((model) => (
                  <option key={model.id} value={model.id}>{model.name} - {model.version}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f8b81]">New version</span>
              <input name="toVersion" required placeholder="v2.1.0" className="w-full rounded-2xl border border-white/10 bg-[#1f201d] px-4 py-3 text-[#f5f3ed] outline-none focus:border-[#6457f6]" />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f8b81]">Strategy</span>
              <select name="strategy" className="w-full rounded-2xl border border-white/10 bg-[#1f201d] px-4 py-3 text-[#f5f3ed] outline-none focus:border-[#6457f6]">
                <option value="canary">Canary</option>
                <option value="blue-green">Blue-green</option>
                <option value="shadow">Shadow</option>
              </select>
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f8b81]">Initial traffic</span>
                <span className="text-2xl font-bold tracking-[-0.06em] text-[#f5f3ed]">{traffic}%</span>
              </div>
              <input
                className="range-dark"
                style={{ "--value": `${traffic}%` } as React.CSSProperties}
                type="range"
                min="0"
                max="100"
                step="5"
                value={traffic}
                onChange={(event) => setTraffic(Number(event.target.value))}
              />
            </div>
          </div>

          {models.length === 0 && !loading ? (
            <div className="mt-6">
              <InlineNotice
                title="No models available"
                message="Create a model in the registry first, then come back here to start a rollout."
              />
            </div>
          ) : null}

          <button type="submit" disabled={pending || models.length === 0} className="mt-7 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6457f6] px-5 py-4 text-lg font-bold text-white shadow-lg shadow-[#6457f6]/20 transition hover:bg-[#756bff] disabled:cursor-not-allowed disabled:opacity-60">
            <Rocket className="h-5 w-5" /> {pending ? "Starting rollout..." : "Start rollout"}
          </button>
        </form>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold tracking-[-0.06em] text-[#f5f3ed]">Active rollouts</h2>
            <span className="rounded-full bg-white/[0.04] px-4 py-2 text-sm font-bold text-[#bcb8ad]">{activeDeployments.length} running</span>
          </div>

          {deployments.length === 0 && !loading ? (
            <EmptyState
              icon={Send}
              title="No rollout history yet"
              description="Start a canary, blue-green, or shadow deployment to see traffic controls and promotion actions here."
            />
          ) : (
            deployments.map((deployment) => (
              <article key={deployment.id} className="glass-card rounded-[24px] p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-2xl font-bold tracking-[-0.05em] text-[#f5f3ed]">{deployment.modelName}</h3>
                      <StatusBadge status={deployment.status} />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-[#bcb8ad]">
                      {deployment.fromVersion} to {deployment.toVersion} - {deployment.strategy} - updated {formatRelativeTime(deployment.updatedAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#8f8b81]">Traffic</p>
                    <p className="text-3xl font-bold tracking-[-0.07em] text-[#f5f3ed]">{deployment.trafficPercent}%</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                  <input
                    className="range-dark"
                    style={{ "--value": `${deployment.trafficPercent}%` } as React.CSSProperties}
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={deployment.trafficPercent}
                    disabled={deployment.status !== "running" || deployment.strategy === "shadow"}
                    onChange={(event) => updateTraffic(deployment.id, Number(event.target.value))}
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => promote(deployment.id)} disabled={deployment.status !== "running"} className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 font-bold text-[#f5f3ed] transition hover:bg-white/[0.04] disabled:opacity-40">
                      Promote <ArrowUpRight className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => rollback(deployment.id)} disabled={deployment.status !== "running"} className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 font-bold text-[#ffb0b0] transition hover:bg-white/[0.04] disabled:opacity-40">
                      Rollback <RotateCcw className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </div>
  );
}
