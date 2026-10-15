"use client";

import { FormEvent, useEffect, useState } from "react";
import { FlaskConical, Send } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineNotice } from "@/components/ui/inline-notice";
import { PageHeader } from "@/components/ui/page-header";

type AvailableDeployment = {
  id: string;
  familyId?: string;
  modelName: string;
  version: string;
  versionId: string;
  status: string;
};
type Prediction = {
  servingSlot?: string;
  servingRole?: string;
  requestId: string;
  modelVersion: string;
  prediction: string;
  probabilities: Record<string, number>;
  inferenceMs: number;
};

const features = [
  { key: "sepal_length", label: "Sepal length", example: "5.1" },
  { key: "sepal_width", label: "Sepal width", example: "3.5" },
  { key: "petal_length", label: "Petal length", example: "1.4" },
  { key: "petal_width", label: "Petal width", example: "0.2" },
] as const;

async function readResponse(response: Response) {
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

export function InferencePage() {
  const [deployments, setDeployments] = useState<AvailableDeployment[]>([]);
  const [selected, setSelected] = useState("");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [sample, setSample] = useState([5.1, 3.5, 1.4, 0.2]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/inference/deployments", { cache: "no-store" })
      .then(readResponse)
      .then((body: { deployments: AvailableDeployment[] }) => {
        setDeployments(body.deployments);
        setSelected(body.deployments[0]?.id ?? "");
      })
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load deployments.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setPrediction(null);
    setError(null);
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(
      features.map(({ key }) => [key, Number(form.get(key))]),
    );
    if (
      Object.values(values).some(
        (value) => !Number.isFinite(value) || value <= 0 || value > 20,
      )
    ) {
      setError(
        "Enter a number greater than 0 and at most 20 for each measurement.",
      );
      setPending(false);
      return;
    }
    try {
      const response = await fetch("/api/inference/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          deployments.find((item) => item.id === selected)?.familyId
            ? {
                familyId: deployments.find((item) => item.id === selected)
                  ?.familyId,
                features: values,
              }
            : { deploymentId: selected, features: values },
        ),
      });
      setPrediction((await readResponse(response)) as Prediction);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Prediction failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Inference runtime"
        title="Inference Playground"
        description="Run a real prediction through the active family route or select a specific activated Iris version."
      />
      {error ? (
        <InlineNotice
          title="Inference unavailable"
          message={error}
          tone="error"
        />
      ) : null}
      {loading ? (
        <InlineNotice
          title="Loading deployments"
          message="Finding available Iris model versions."
        />
      ) : null}
      {!loading && deployments.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No inference deployments"
          description="Train and register an Iris model artifact, then activate its version from the Model Registry."
        />
      ) : null}
      {deployments.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            onSubmit={submit}
            className="glass-card space-y-5 rounded-lg p-6"
          >
            <h2 className="text-lg font-medium">Prediction input</h2>
            <label className="block space-y-2">
              <span className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
                Deployed model
              </span>
              <select
                value={selected}
                onChange={(event) => {
                  setSelected(event.target.value);
                  setPrediction(null);
                }}
                className="w-full rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
              >
                {deployments.map((deployment) => (
                  <option key={deployment.id} value={deployment.id}>
                    {deployment.modelName} · {deployment.version}
                    {deployment.familyId
                      ? " · serving route"
                      : " · direct version"}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs muted">Example inputs</span>
              {[
                [5.1, 3.5, 1.4, 0.2],
                [6, 2.9, 4.5, 1.5],
                [6.7, 3, 5.2, 2.3],
              ].map((v, i) => (
                <button
                  key={i}
                  type="button"
                  className="btn"
                  onClick={() => setSample(v)}
                >
                  Sample {i + 1}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {features.map(({ key, label, example }, index) => (
                <label key={key} className="block space-y-2">
                  <span className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
                    {label} (cm)
                  </span>
                  <input
                    name={key}
                    type="number"
                    step="any"
                    min="0.001"
                    max="20"
                    required
                    placeholder={example}
                    value={sample[index]}
                    onChange={(e) =>
                      setSample((current) =>
                        current.map((v, i) =>
                          i === index ? Number(e.target.value) : v,
                        ),
                      )
                    }
                    className="w-full rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                  />
                </label>
              ))}
            </div>
            <button
              type="submit"
              disabled={pending || !selected}
              className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> {pending ? "Running..." : "Predict"}
            </button>
          </form>
          <section className="glass-card rounded-lg p-6" aria-live="polite">
            <h2 className="text-lg font-medium">Result</h2>
            {prediction ? (
              <div className="mt-7 space-y-5">
                <div className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
                  Predicted Iris species
                </div>
                <div className="text-4xl font-medium capitalize text-[var(--success)]">
                  {prediction.prediction}
                </div>
                <div className="grid grid-cols-2 gap-4 text-[var(--secondary)]">
                  <div>
                    Model version
                    <br />
                    <strong className="text-[var(--foreground)]">
                      {prediction.modelVersion}
                    </strong>
                  </div>
                  <div>
                    Inference latency
                    <br />
                    <strong className="text-[var(--foreground)]">
                      {prediction.inferenceMs.toFixed(3)} ms
                    </strong>
                  </div>
                </div>
                <div className="space-y-2 border-t border-white/10 pt-5 text-sm">
                  {Object.entries(prediction.probabilities).map(
                    ([label, value]) => (
                      <div key={label}>
                        <div className="flex justify-between capitalize">
                          <span>{label}</span>
                          <span>{(value * 100).toFixed(1)}%</span>
                        </div>
                        <div className="progress mt-2">
                          <span style={{ width: `${value * 100}%` }} />
                        </div>
                      </div>
                    ),
                  )}
                </div>
                {prediction.servingSlot && (
                  <p className="text-xs muted">
                    Runtime: {prediction.servingSlot} · {prediction.servingRole}
                  </p>
                )}
                <p className="text-xs muted">
                  Class probability is a model estimate, not measured accuracy.
                </p>
                <details>
                  <summary className="cursor-pointer text-xs muted">
                    JSON response
                  </summary>
                  <pre className="mt-3 panel p-3">
                    {JSON.stringify(prediction, null, 2)}
                  </pre>
                  <button
                    type="button"
                    className="btn mt-2"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          JSON.stringify(prediction, null, 2),
                        );
                        setCopied(true);
                      } catch {
                        setError(
                          "Clipboard unavailable. Select and copy the JSON response.",
                        );
                      }
                    }}
                  >
                    {copied ? "Copied" : "Copy JSON"}
                  </button>
                </details>
                <p className="break-all text-xs text-[var(--secondary)]">
                  Request ID: {prediction.requestId}
                </p>
              </div>
            ) : (
              <p className="mt-6 text-[var(--secondary)]">
                {pending
                  ? "Executing prediction in the model runtime…"
                  : "Your prediction will appear here. Choose a sample or enter four flower measurements to begin."}
              </p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
