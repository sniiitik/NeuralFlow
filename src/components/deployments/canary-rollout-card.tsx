import Link from "next/link";
import type { Deployment } from "@/lib/types";
export function CanaryRolloutCard({
  deployment: d,
}: {
  deployment?: Deployment;
  onChange?: () => void | Promise<void>;
}) {
  return (
    <section className="panel p-5">
      <div className="flex justify-between">
        <h2 className="font-medium">Active rollout</h2>
        <Link className="text-xs muted hover:underline" href="/deployments">
          Manage deployments →
        </Link>
      </div>
      {d ? (
        <div className="mt-5 space-y-4">
          <div className="flex justify-between">
            <span>{d.modelName}</span>
            <span className="badge">{d.strategy}</span>
          </div>
          <div className="flex justify-between text-xs muted">
            <span>Stable · {d.fromVersion}</span>
            <span>Candidate · {d.toVersion}</span>
          </div>
          <div className="progress">
            <span style={{ width: `${d.trafficPercent}%` }} />
          </div>
          <p className="text-xs muted">
            Configured {d.strategy === "shadow" ? "mirror" : "candidate"}{" "}
            allocation: {d.trafficPercent}%
          </p>
          <p className="text-xs muted">
            Observed: {d.observed?.stable ?? 0} stable /{" "}
            {d.observed?.candidate ?? 0} candidate requests
          </p>
        </div>
      ) : (
        <div className="py-8">
          <p>No active rollout</p>
          <p className="mt-2 text-sm muted">
            Prepare a candidate when you’re ready to release a new version.
          </p>
          <Link href="/deployments" className="btn mt-4">
            View deployments
          </Link>
        </div>
      )}
    </section>
  );
}
