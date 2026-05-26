"use client";

import { X } from "lucide-react";
import { FormEvent, useState } from "react";
import { InlineNotice } from "@/components/ui/inline-notice";
import { apiClient } from "@/lib/api-client";
import type { MLModel, ModelFramework, ModelStatus } from "@/lib/types";

const frameworks: ModelFramework[] = ["PyTorch", "TensorFlow", "XGBoost", "sklearn", "BERT"];
const statuses: ModelStatus[] = ["shadow", "canary", "rolling", "live"];

export function NewModelModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (model: MLModel) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#242520] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-[-0.06em] text-[#f5f3ed]">Register model</h2>
            <p className="mt-1 text-[#bcb8ad]">Add a new version to the NeuralFlow registry.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 text-[#d4d0c6] hover:bg-white/[0.04]" aria-label="Close modal">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {error ? <div className="sm:col-span-2"><InlineNotice title="Model creation failed" message={error} tone="error" /></div> : null}
          <label className="space-y-2">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f8b81]">Name</span>
            <input name="name" required placeholder="fraud-detector" className="w-full rounded-2xl border border-white/10 bg-[#1f201d] px-4 py-3 text-[#f5f3ed] outline-none focus:border-[#6457f6]" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f8b81]">Version</span>
            <input name="version" required placeholder="v1.0.0" className="w-full rounded-2xl border border-white/10 bg-[#1f201d] px-4 py-3 text-[#f5f3ed] outline-none focus:border-[#6457f6]" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f8b81]">Framework</span>
            <select name="framework" className="w-full rounded-2xl border border-white/10 bg-[#1f201d] px-4 py-3 text-[#f5f3ed] outline-none focus:border-[#6457f6]">
              {frameworks.map((framework) => <option key={framework}>{framework}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f8b81]">Status</span>
            <select name="status" className="w-full rounded-2xl border border-white/10 bg-[#1f201d] px-4 py-3 text-[#f5f3ed] outline-none focus:border-[#6457f6]">
              {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f8b81]">Owner</span>
            <input name="owner" placeholder="Platform ML" className="w-full rounded-2xl border border-white/10 bg-[#1f201d] px-4 py-3 text-[#f5f3ed] outline-none focus:border-[#6457f6]" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f8b81]">Replicas</span>
            <input name="replicas" type="number" min="1" max="12" defaultValue="1" className="w-full rounded-2xl border border-white/10 bg-[#1f201d] px-4 py-3 text-[#f5f3ed] outline-none focus:border-[#6457f6]" />
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f8b81]">Artifact</span>
            <input name="artifact" type="file" accept=".pkl,.pt,.pth,.onnx,.joblib,.json,.bin,.xgb" className="w-full rounded-2xl border border-dashed border-white/10 bg-[#1f201d] px-4 py-3 text-[#cfcac0] file:mr-4 file:rounded-xl file:border-0 file:bg-[#e8e7ff] file:px-4 file:py-2 file:font-bold file:text-[#4d4592] hover:border-[#6457f6]/50" />
            <p className="text-xs font-semibold text-[#8f8b81]">Optional demo upload. NeuralFlow stores the artifact metadata locally.</p>
          </label>
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-[#8f8b81]">Description</span>
            <textarea name="description" rows={3} placeholder="What does this model do?" className="w-full resize-none rounded-2xl border border-white/10 bg-[#1f201d] px-4 py-3 text-[#f5f3ed] outline-none focus:border-[#6457f6]" />
          </label>
          <div className="flex justify-end gap-3 sm:col-span-2">
            <button type="button" onClick={onClose} className="rounded-2xl border border-white/10 px-5 py-3 font-bold text-[#d8d3ca] hover:bg-white/[0.04]">Cancel</button>
            <button type="submit" disabled={pending} className="rounded-2xl bg-[#6457f6] px-5 py-3 font-bold text-white hover:bg-[#756bff] disabled:opacity-60">
              {pending ? "Creating..." : "Create model"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
