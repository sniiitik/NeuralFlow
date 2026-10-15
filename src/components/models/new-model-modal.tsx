"use client";

import { Dialog } from "@/components/ui/dialog";
import { FormEvent, useState } from "react";
import { InlineNotice } from "@/components/ui/inline-notice";
import { apiClient } from "@/lib/api-client";
import type { MLModel, ModelFramework } from "@/lib/types";

const frameworks: ModelFramework[] = [
  "PyTorch",
  "TensorFlow",
  "XGBoost",
  "sklearn",
  "BERT",
];


export function NewModelModal({
  open,
  onClose,
  onCreated,
  familyNames = [],
}: {
  familyNames?: string[];
  open: boolean;
  onClose: () => void;
  onCreated: (model: MLModel) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    if (!String(form.get("owner") ?? "").trim())
      form.set("owner", "Unassigned");
    const artifact = form.get("artifact");
    if (artifact instanceof File && artifact.size > 16 * 1024 * 1024) {
      setError("Artifact exceeds the 16 MiB limit.");
      setPending(false);
      return;
    }
    try {
      const response = await apiClient.createModelForm(form);
      onCreated(response.model);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create model.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Register model version">
      <p className="text-sm muted">
        Use an existing family name to add a version, or enter a new name.
        Version metadata cannot be edited after registration.
      </p>
      <datalist id="model-family-names">{familyNames.map(name=><option key={name} value={name}/>)}</datalist>
      <form
        onSubmit={submit}
        className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        {error ? (
          <div className="sm:col-span-2">
            <InlineNotice
              title="Model creation failed"
              message={error}
              tone="error"
            />
          </div>
        ) : null}
        <label className="space-y-2">
          <span className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
            Name
          </span>
          <input
            list="model-family-names"
            name="name"
            required
            placeholder="iris-classifier"
            className="w-full rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
            Version
          </span>
          <input
            name="version"
            required
            placeholder="v1.0.0"
            className="w-full rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
            Framework
          </span>
          <select
            defaultValue="sklearn"
            name="framework"
            className="w-full rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          >
            {frameworks.map((framework) => (
              <option key={framework}>{framework}</option>
            ))}
          </select>
        </label>
        <input type="hidden" name="status" value="shadow"/>
        <label className="space-y-2">
          <span className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
            Owner
          </span>
          <input
            name="owner"
            placeholder="Platform ML"
            className="w-full rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <input type="hidden" name="replicas" value="1"/>
        <label className="space-y-2 sm:col-span-2">
          <span className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
            Artifact
          </span>
          <input
            name="artifact"
            type="file"
            accept=".json,.safetensors"
            className="w-full rounded-lg border border-dashed border-white/10 bg-[var(--surface)] px-4 py-3 text-[var(--secondary)] file:mr-4 file:rounded-xl file:border-0 file:bg-[var(--elevated)] file:px-4 file:py-2 file:font-medium file:text-[var(--accent-text)] hover:border-[var(--accent)]/50"
          />
          <p className="text-xs font-semibold text-[var(--secondary)]">
            Up to 16 MiB. JSON and safetensors can be stored; only NeuralFlow
            Iris JSON can run inference. Executable formats such as pickle are
            not supported.
          </p>
        </label>
        <label className="space-y-2 sm:col-span-2">
          <span className="text-sm font-medium uppercase tracking-wide text-[var(--secondary)]">
            Description
          </span>
          <textarea
            name="description"
            rows={3}
            placeholder="What does this model do?"
            className="w-full resize-none rounded-lg border border-white/10 bg-[var(--surface)] px-4 py-3 text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          />
        </label>
        <div className="flex justify-end gap-3 sm:col-span-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-5 py-3 font-medium text-[var(--secondary)] hover:bg-white/[0.04]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-[var(--accent)] px-5 py-3 font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {pending ? "Creating..." : "Register version"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
