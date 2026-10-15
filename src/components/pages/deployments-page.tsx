"use client";

import { ArrowUpRight, RotateCcw, Rocket, Send } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog } from "@/components/ui/dialog";
import { useAccess } from "@/hooks/use-access";
import { apiClient } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format";
import type { Deployment, DeploymentStrategy, MLModel } from "@/lib/types";

export function DeploymentsPage() {
  const { canWrite } = useAccess();
  const [confirmation, setConfirmation] = useState<{
    id: string;
    action: "promote" | "rollback";
  } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [selectedModel, setSelectedModel] = useState("");
  const [history, setHistory] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<MLModel[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [traffic, setTraffic] = useState(10);
  const [strategy, setStrategy] = useState<DeploymentStrategy>("canary");
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [modelResponse, deploymentResponse] = await Promise.all([
        apiClient.getModels(),
        apiClient.getDeployments(),
      ]);
      setModels(modelResponse.models);
      setDeployments(deploymentResponse.deployments);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load deployment data.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([apiClient.getModels(), apiClient.getDeployments()])
      .then(([modelResponse, deploymentResponse]) => {
        if (!active) return;
        setModels(modelResponse.models);
        setDeployments(deploymentResponse.deployments);
        setError(null);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load deployment data.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      apiClient
        .getDeployments()
        .then((response) => setDeployments(response.deployments))
        .catch(() =>
          setError(
            "Deployment updates disconnected. Displayed state may be stale.",
          ),
        );
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const activeDeployments = useMemo(
    () =>
      deployments.filter(
        (deployment) =>
          deployment.status === "running" &&
          deployment.lifecycleState === "active",
      ),
    [deployments],
  );
  const deployableModels = useMemo(
    () =>
      models.filter(
        (model) => model.framework === "sklearn" && model.artifactAvailable,
      ),
    [models],
  );

  async function createDeployment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const modelId = String(
      form.get("modelId") || deployableModels[0]?.id || "",
    );
    const model = models.find((item) => item.id === modelId);
    const requestedStrategy = String(
      form.get("strategy"),
    ) as DeploymentStrategy;
    const toVersion = String(form.get("toVersion"));

    if (!model || !toVersion) return;

    setPending(true);
    try {
      await apiClient.createDeployment({
        modelId,
        fromVersion: model.version,
        toVersion,
        strategy: requestedStrategy,
        trafficPercent: traffic,
        idempotencyKey: crypto.randomUUID(),
      });
      await load();
      formElement.reset();
      setTraffic(10);
      setStrategy("canary");
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create deployment.",
      );
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
      setError(
        err instanceof Error ? err.message : "Unable to update traffic split.",
      );
    }
  }

  async function promote(id: string) {
    try {
      await apiClient.promoteDeployment(id);
      await load();
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to promote deployment.",
      );
    }
  }

  async function rollback(id: string) {
    try {
      await apiClient.rollbackDeployment(id);
      await load();
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to roll back deployment.",
      );
    }
  }

  async function retry(id: string) {
    try {
      await apiClient.retryDeployment(id);
      await load();
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to retry deployment.",
      );
    }
  }

  const filteredDeployments = deployments.filter((d) =>
    `${d.modelName} ${d.status} ${d.strategy}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Release control"
        title="Deployments"
        description="Create canary, blue-green, and shadow rollouts with traffic controls and rollback actions."
      />

      {!canWrite && (
        <InlineNotice
          title="Read-only deployment access"
          message="An operator or administrator can create, promote, or roll back deployments."
        />
      )}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr]">
        <form
          onSubmit={createDeployment}
          className="glass-card self-start rounded-lg p-5"
        >
          <h2 className="text-xl font-medium tracking-tight text-[var(--foreground)]">
            New rollout
          </h2>
          <p className="mt-2 text-[var(--secondary)]">
            Register artifacts for both versions, then load and verify the
            rollout in the inference runtime.
          </p>

          {error ? (
            <div className="mt-5">
              <InlineNotice
                title="Deployment action failed"
                message={error}
                tone="error"
              />
            </div>
          ) : null}
          {loading && !error ? (
            <div className="mt-5">
              <InlineNotice
                title="Loading deployments"
                message="Fetching registered models and active rollout state."
              />
            </div>
          ) : null}

          <fieldset disabled={!canWrite || pending} className="mt-6 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
                Model
              </span>
              <select
                name="modelId"
                value={selectedModel || deployableModels[0]?.id || ""}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                {deployableModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} - {model.version}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
                New version
              </span>
              <select name="toVersion" required className="w-full">
                <option value="">Choose registered candidate</option>
                {deployableModels
                  .filter(
                    (m) =>
                      m.familyId ===
                        deployableModels.find(
                          (v) =>
                            v.id === (selectedModel || deployableModels[0]?.id),
                        )?.familyId &&
                      m.id !== (selectedModel || deployableModels[0]?.id),
                  )
                  .map((m) => (
                    <option key={m.id} value={m.version}>
                      {m.version}
                    </option>
                  ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
                Strategy
              </span>
              <select
                name="strategy"
                value={strategy}
                onChange={(event) => {
                  const next = event.target.value as DeploymentStrategy;
                  setStrategy(next);
                  setTraffic(next === "blue-green" ? 0 : 10);
                }}
                className="w-full rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                <option value="canary">Canary</option>
                <option value="blue-green">Blue-green</option>
                <option value="shadow">Shadow</option>
              </select>
            </label>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
                  {strategy === "shadow" ? "Mirror rate" : "Candidate traffic"}
                </span>
                <span className="text-lg font-medium tracking-tight text-[var(--foreground)]">
                  {traffic}%
                </span>
              </div>
              <input
                aria-label="Initial candidate allocation"
                className="range-dark"
                style={{ "--value": `${traffic}%` } as React.CSSProperties}
                type="range"
                min="0"
                max="100"
                step="5"
                value={traffic}
                disabled={strategy === "blue-green"}
                onChange={(event) => setTraffic(Number(event.target.value))}
              />
            </div>
          </fieldset>

          {deployableModels.length === 0 && !loading ? (
            <div className="mt-6">
              <InlineNotice
                title="No models available"
                message="Register two versions with supported Iris JSON artifacts before starting a rollout."
              />
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canWrite || pending || deployableModels.length === 0}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-4 text-lg font-medium text-white  transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Rocket className="h-5 w-5" />{" "}
            {pending ? "Starting rollout..." : "Start rollout"}
          </button>
        </form>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium tracking-tight text-[var(--foreground)]">
              Deployment history
            </h2>
            <span className="rounded-full bg-white/[0.04] px-4 py-2 text-sm font-medium text-[var(--secondary)]">
              {activeDeployments.length} running
            </span>
          </div>

          <input
            aria-label="Search deployments"
            placeholder="Search model, strategy, or status…"
            className="w-full"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          {deployments.length === 0 && !loading ? (
            <EmptyState
              icon={Send}
              title="No rollout history yet"
              description="Start a canary, blue-green, or shadow deployment to see traffic controls and promotion actions here."
            />
          ) : (
            filteredDeployments
              .slice(page * 6, page * 6 + 6)
              .map((deployment) => (
                <article
                  key={deployment.id}
                  className="glass-card rounded-lg p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-medium tracking-tight text-[var(--foreground)]">
                          {deployment.modelName}
                        </h3>
                        <StatusBadge status={deployment.status} />
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[var(--secondary)]">
                        {deployment.fromVersion} to {deployment.toVersion} -{" "}
                        {deployment.strategy} - updated{" "}
                        {formatRelativeTime(deployment.updatedAt)}
                      </p>
                {deployment.lifecycleState ? (
                        <p className="mt-1 text-xs text-[var(--secondary)]">
                          Runtime: {deployment.lifecycleState}
                        </p>
                      ) : null}
                      {deployment.lastError ? (
                        <p className="mt-2 text-sm text-[var(--danger)]">
                          {deployment.lastError}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--secondary)]">
                        {deployment.strategy === "shadow"
                          ? "Mirror rate"
                          : "Traffic"}
                      </p>
                      <p className="text-xl font-medium tracking-tight text-[var(--foreground)]">
                        {deployment.trafficPercent}%
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3"><div className="panel p-3"><p className="label">Original stable</p><p className="mono">{deployment.fromVersion || "Initial activation"}</p><p className="text-xs muted">{deployment.stableSlot ?? "No runtime slot"}</p></div><div className="panel p-3"><p className="label">{deployment.strategy === "blue-green" ? "Standby / candidate" : deployment.strategy === "shadow" ? "Shadow candidate" : "Candidate"}</p><p className="mono">{deployment.toVersion}</p><p className="text-xs muted">{deployment.candidateSlot ?? "No runtime slot"}</p></div></div>
                {deployment.lifecycleState ? (
                    <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.025] p-4 text-sm text-[var(--secondary)]">
                      <p>
                        Runtime slots: {deployment.stableSlot ?? "—"} stable ·{" "}
                        {deployment.candidateSlot ?? "—"} candidate
                      </p>
                      <p className="mt-1">
                        Observed primary requests:{" "}
                        {deployment.observed?.stable ?? 0} stable ·{" "}
                        {deployment.observed?.candidate ?? 0} candidate
                        {" · "}
                        {(deployment.observed?.candidatePercent ?? 0).toFixed(
                          1,
                        )}
                        % candidate
                      </p>
                      {deployment.strategy === "shadow" ? (
                        <p className="mt-1">
                          Shadow executions: {deployment.observed?.shadow ?? 0}{" "}
                          succeeded
                          {" · "}
                          {deployment.observed?.shadowFailures ?? 0} failed ·{" "}
                          {deployment.observed?.shadowSkipped ?? 0} skipped
                        </p>
                      ) : null}
                      {deployment.observed?.candidateFailures ? (
                        <p className="mt-1 text-[var(--danger)]">
                          Candidate failures:{" "}
                          {deployment.observed.candidateFailures}; served from
                          stable.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-4 progress">
                    <span style={{ width: `${deployment.trafficPercent}%` }} />
                  </div>
                  <p className="mt-2 text-xs muted">
                    Configured{" "}
                    {deployment.strategy === "shadow" ? "mirror" : "candidate"}{" "}
                    allocation · {deployment.trafficPercent}%
                    {deployment.strategy === "shadow"
                      ? " · Candidate responses never replace the stable response."
                      : deployment.strategy === "blue-green" && deployment.status === "running"
                        ? " · Candidate remains on standby until promotion."
                        : ""}
                  </p>
                  <button
                    className="mt-3 text-xs muted underline"
                    onClick={async () => {
                      try {
                        const r = await fetch(
                          `/api/deployments/${deployment.id}/requests`,
                        );
                        if (!r.ok)
                          throw new Error("Unable to load request history");
                        setHistory(JSON.stringify(await r.json(), null, 2));
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : "Request failed",
                        );
                      }
                    }}
                  >
                    Inspect recorded requests
                  </button>
                  <div className="mt-5 grid gap-4">
                    <input
                      className="range-dark"
                      style={
                        {
                          "--value": `${deployment.trafficPercent}%`,
                        } as React.CSSProperties
                      }
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      aria-label={`Candidate allocation for ${deployment.modelName}`}
                      value={drafts[deployment.id] ?? deployment.trafficPercent}
                      disabled={
                        !canWrite ||
                        pending ||
                        deployment.status !== "running" ||
                        deployment.lifecycleState !== "active" ||
                        deployment.strategy === "blue-green"
                      }
                      onChange={(event) =>
                        setDrafts((d) => ({
                          ...d,
                          [deployment.id]: Number(event.target.value),
                        }))
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn"
                        disabled={
                          !canWrite ||
                          pending ||
                          drafts[deployment.id] == null ||
                          deployment.status !== "running" ||
                          deployment.strategy === "blue-green"
                        }
                        onClick={async () => {
                          setPending(true);
                          await updateTraffic(
                            deployment.id,
                            drafts[deployment.id],
                          );
                          setPending(false);
                        }}
                      >
                        Save{" "}
                        {drafts[deployment.id] ?? deployment.trafficPercent}%
                      </button>
                      {deployment.lifecycleState === "failed" ? (
                        <button
                          type="button"
                          disabled={!canWrite || pending}
                          onClick={() => retry(deployment.id)}
                          className="rounded-lg border border-white/10 px-4 py-3 font-medium text-[var(--foreground)]"
                        >
                          Retry
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmation({
                            id: deployment.id,
                            action: "promote",
                          })
                        }
                        disabled={
                          !canWrite ||
                          pending ||
                          deployment.status !== "running" ||
                          deployment.lifecycleState !== "active"
                        }
                        className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-3 font-medium text-[var(--foreground)] transition hover:bg-white/[0.04] disabled:opacity-40"
                      >
                        Promote <ArrowUpRight className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmation({
                            id: deployment.id,
                            action: "rollback",
                          })
                        }
                        disabled={
                          !canWrite ||
                          pending ||
                          !deployment.lifecycleState ||
                          !["running", "completed"].includes(deployment.status)
                        }
                        className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-3 font-medium text-[var(--danger)] transition hover:bg-white/[0.04] disabled:opacity-40"
                      >
                        Rollback <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              ))
          )}
          <div className="flex items-center justify-between text-xs muted">
            <span>
              {filteredDeployments.length} deployments · page {page + 1} of{" "}
              {Math.max(1, Math.ceil(filteredDeployments.length / 6))}
            </span>
            <div className="flex gap-2">
              <button
                className="btn"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                className="btn"
                disabled={(page + 1) * 6 >= filteredDeployments.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </section>
      <Dialog
        open={!!confirmation}
        onClose={() => {
          if (!pending) setConfirmation(null);
        }}
        title={
          confirmation?.action === "promote"
            ? "Promote candidate?"
            : "Restore previous version?"
        }
      >
        <p className="text-sm muted">
          {confirmation?.action === "promote"
            ? "This switches actual inference traffic to the candidate version. The previous stable version is retained for rollback."
            : "This restores the previous stable version and changes actual inference routing."}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="btn"
            disabled={pending}
            onClick={() => setConfirmation(null)}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={pending}
            onClick={async () => {
              if (!confirmation) return;
              setPending(true);
              await (confirmation.action === "promote"
                ? promote(confirmation.id)
                : rollback(confirmation.id));
              setPending(false);
              setConfirmation(null);
            }}
          >
            {pending ? "Applying…" : "Confirm serving change"}
          </button>
        </div>
      </Dialog>
      <Dialog
        open={history !== null}
        onClose={() => setHistory(null)}
        title="Recorded inference requests"
      >
        <p className="text-xs muted">
          Latest 25 executions associated with this deployment.
        </p>
        <pre>{history}</pre>
      </Dialog>
    </div>
  );
}
