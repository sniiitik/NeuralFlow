"use client";

import { ArrowUpRight, Rocket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Deployment } from "@/lib/types";
import { apiClient } from "@/lib/api-client";

export function CanaryRolloutCard({ deployment, onChange }: { deployment?: Deployment; onChange?: () => void }) {
  const [pending, setPending] = useState(false);
  const [traffic, setTraffic] = useState(deployment?.trafficPercent ?? 20);

  const rollout = useMemo(() => deployment, [deployment]);

  useEffect(() => {
    if (deployment) setTraffic(deployment.trafficPercent);
  }, [deployment]);

  if (!rollout) {
    return (
      <section className="glass-card flex min-h-[390px] flex-col justify-center rounded-[20px] p-8">
        <h2 className="text-[28px] font-bold tracking-[-0.06em] text-[#f5f3ed]">No active rollout</h2>
        <p className="mt-3 text-lg text-[#bcb8ad]">Create a deployment to see canary controls here.</p>
      </section>
    );
  }

  async function updateTraffic(nextTraffic: number) {
    if (!rollout) return;
    setTraffic(nextTraffic);
    await apiClient.updateTraffic(rollout.id, nextTraffic);
    onChange?.();
  }

  async function promote() {
    if (!rollout) return;
    setPending(true);
    try {
      await apiClient.promoteDeployment(rollout.id);
      onChange?.();
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="glass-card rounded-[20px] p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[28px] font-bold tracking-[-0.06em] text-[#f5f3ed]">Canary rollout</h2>
        <span className="text-xl font-bold tracking-[-0.04em] text-[#6457f6]">
          {rollout.modelName} {rollout.toVersion}
        </span>
      </div>

      <div className="mt-7 text-[23px] font-bold tracking-[-0.04em] text-[#c8c3b9]">Traffic split to new version</div>

      <div className="mt-5 flex items-center gap-8">
        <input
          className="range-dark"
          style={{ "--value": `${traffic}%` } as React.CSSProperties}
          type="range"
          min={0}
          max={100}
          step={5}
          value={traffic}
          disabled={rollout.strategy === "shadow"}
          onChange={(event) => updateTraffic(Number(event.target.value))}
          aria-label="Canary traffic split"
        />
        <span className="min-w-16 text-right text-[28px] font-bold tracking-[-0.06em] text-[#f5f3ed]">{traffic}%</span>
      </div>

      <div className="mt-5 flex items-center justify-between text-[22px] font-bold tracking-[-0.05em] text-[#bfbab0]">
        <span>{rollout.fromVersion} (stable)</span>
        <span>{rollout.toVersion} (canary)</span>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-[#1f201d] p-5">
          <div className="text-[22px] font-bold leading-none tracking-[-0.04em] text-[#bcb8ad]">Stable latency</div>
          <div className="mt-2 text-[32px] font-bold leading-none tracking-[-0.07em] text-white">{rollout.stableLatencyMs}ms</div>
        </div>
        <div className="rounded-2xl bg-[#e8e7ff] p-5 text-[#4d4592]">
          <div className="text-[22px] font-bold leading-tight tracking-[-0.04em]">Canary latency</div>
          <div className="mt-2 text-[32px] font-bold leading-none tracking-[-0.07em]">{rollout.canaryLatencyMs}ms</div>
        </div>
      </div>

      <button
        type="button"
        onClick={promote}
        disabled={pending || rollout.status !== "running"}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl border border-white/20 px-5 py-4 text-[27px] font-bold tracking-[-0.06em] text-[#f5f3ed] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Rocket className="h-6 w-6" />
        {pending ? "Promoting..." : `Promote to ${traffic}%`}
        <ArrowUpRight className="h-7 w-7" />
      </button>
    </section>
  );
}
