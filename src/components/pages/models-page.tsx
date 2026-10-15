"use client";
import { Plus, Boxes } from "lucide-react";
import { useEffect, useState } from "react";
import { NewModelModal } from "@/components/models/new-model-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog } from "@/components/ui/dialog";
import { apiClient } from "@/lib/api-client";
import { useAccess } from "@/hooks/use-access";
import type { MLModel } from "@/lib/types";
export function ModelsPage() {
  const [page, setPage] = useState(0);
  const [models, setModels] = useState<MLModel[]>([]),
    [query, setQuery] = useState(""),
    [framework, setFramework] = useState("all"),
    [sort, setSort] = useState("newest"),
    [open, setOpen] = useState(false),
    [detail, setDetail] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const { canWrite } = useAccess();
  useEffect(() => {
    apiClient
      .getModels()
      .then((r) => setModels(r.models))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const families = Object.values(
    models.reduce<Record<string, MLModel[]>>((a, m) => {
      (a[m.familyId ?? m.name] ??= []).push(m);
      return a;
    }, {}),
  )
    .map((v) => v.sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    .filter(
      (v) =>
        v.some((m) =>
          `${m.name} ${m.version} ${m.owner}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        ) &&
        (framework === "all" || v[0].framework === framework),
    )
    .sort((a, b) =>
      sort === "name"
        ? a[0].name.localeCompare(b[0].name)
        : b[0].createdAt.localeCompare(a[0].createdAt),
    );
  const versions = models
    .filter((m) => (m.familyId ?? m.name) === detail)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function activate(id: string) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/inference/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId: id }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Activation failed");
      setMessage(
        "Version loaded and ready for direct inference. Open the Inference Playground to test it.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Model Registry"
        description="Versioned models and verified artifacts. A durable foundation for every deployment."
        action={
          <button
            className="btn btn-primary"
            disabled={!canWrite}
            title={
              !canWrite
                ? "Operator or administrator access required"
                : undefined
            }
            onClick={() => setOpen(true)}
          >
            <Plus size={16} />
            Register version
          </button>
        }
      />
      {!canWrite && (
        <p className="text-xs muted">
          Read-only registry access · registration requires an operator or
          administrator.
        </p>
      )}
      {error && (
        <InlineNotice
          title="Registry request failed"
          message={error}
          tone="error"
        />
      )}
      {message && <InlineNotice title="Version ready" message={message} />}
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search model families"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Search models, versions, owners…"
          className="w-full min-w-0 basis-full sm:flex-1 sm:basis-auto"
        />
        <select
          aria-label="Filter framework"
          value={framework}
          onChange={(e) => {
            setFramework(e.target.value);
            setPage(0);
          }}
        >
          <option value="all">All frameworks</option>
          {Array.from(new Set(models.map((m) => m.framework))).map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <select
          aria-label="Sort models"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="name">Name A–Z</option>
        </select>
      </div>
      {loading ? (
        <InlineNotice
          title="Loading registry"
          message="Retrieving registered model families and versions."
        />
      ) : !families.length ? (
        <EmptyState
          icon={Boxes}
          title="No matching models"
          description="Register your first version or adjust your search."
        />
      ) : (
        <div className="panel overflow-x-auto" tabIndex={0} role="region" aria-label="Model families table; scroll horizontally on narrow screens">
          <table className="min-w-[800px]">
            <thead>
              <tr>
                <th>Model family</th>
                <th>Framework</th>
                <th>Versions</th>
                <th>Latest registered</th>
                <th>Owner</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {families.slice(page * 15, page * 15 + 15).map((v) => (
                <tr key={v[0].familyId ?? v[0].name}>
                  <td>
                    <button
                      className="text-left font-medium hover:underline"
                      onClick={() => setDetail(v[0].familyId ?? v[0].name)}
                    >
                      {v[0].name}
                    </button>
                    <p className="text-xs muted max-w-xs truncate">
                      {v[0].description || "No description"}
                    </p>
                  </td>
                  <td className="muted">{v[0].framework}</td>
                  <td>{v.length}</td>
                  <td className="mono">{v[0].version}</td>
                  <td className="muted">{v[0].owner || "—"}</td>
                  <td className="text-xs muted whitespace-nowrap">
                    {new Date(v[0].createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between items-center text-xs muted">
        <span>{families.length} model families</span>
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
            disabled={(page + 1) * 15 >= families.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
      <Dialog
        open={!!detail}
        onClose={() => setDetail(null)}
        title={versions[0]?.name ?? "Model details"}
      >
        <p className="text-sm muted mb-5">
          {versions[0]?.description} Version metadata is immutable. Register a
          new version to change the model.
        </p>
        {versions.map((m) => (
          <section
            key={m.id}
            className="border-t border-[var(--border)] py-5 space-y-3"
          >
            <div className="flex justify-between">
              <strong className="mono">{m.version}</strong>
              <StatusBadge status={m.status} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="muted">Registered</dt>
                <dd>{new Date(m.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="muted">Runtime compatibility</dt>
                <dd>
                  {m.framework === "sklearn"
                    ? "Iris JSON required"
                    : "Registry storage only"}
                </dd>
              </div>
            </dl>
            <p className="text-xs muted">
              {m.artifactAvailable ? "Artifact stored" : "No stored artifact"} ·{" "}
              {m.artifactName ?? "—"}{" "}
              {m.artifactSizeKb ? `· ${m.artifactSizeKb} KB` : ""}
            </p>
            {m.artifactSha256 && (
              <div>
                <p className="label">
                  SHA-256 · verified on upload and retrieval
                </p>
                <p className="mono muted">{m.artifactSha256}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {m.artifactAvailable && (
                <a className="btn" href={`/api/models/${m.id}/artifact`}>
                  Download artifact
                </a>
              )}
              {canWrite && m.artifactAvailable && m.framework === "sklearn" && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => activate(m.id)}
                >
                  {busy ? "Preparing…" : "Activate for inference"}
                </button>
              )}
            </div>
          </section>
        ))}
        {message && (
          <p role="status" className="text-sm text-[var(--success)]">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <a className="btn mt-4" href="/deployments">
          View deployments
        </a>
      </Dialog>
      <NewModelModal
        familyNames={Array.from(new Set(models.map(m=>m.name)))}
        open={open}
        onClose={() => setOpen(false)}
        onCreated={(m) => {
          setModels((v) => [m, ...v]);
          setMessage(`${m.name} ${m.version} registered successfully.`);
        }}
      />
    </div>
  );
}
