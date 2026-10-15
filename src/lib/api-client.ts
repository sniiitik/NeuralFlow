import type { Deployment, MetricSnapshot, MLModel, TimeSeriesPoint } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status}). Please try again.`);
  }

  return response.json() as Promise<T>;
}


async function requestForm<T>(path: string, body: FormData): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === "string" ? body.error : `Request failed (${response.status}). Please try again.`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  getModels: () => request<{ models: MLModel[] }>("/api/models"),
  createModel: (model: Partial<MLModel>) =>
    request<{ model: MLModel }>("/api/models", {
      method: "POST",
      body: JSON.stringify(model),
    }),
  createModelForm: (formData: FormData) => requestForm<{ model: MLModel }>("/api/models", formData),
  getDeployments: () => request<{ deployments: Deployment[] }>("/api/deployments"),
  createDeployment: (payload: {
    modelId: string;
    fromVersion: string;
    toVersion: string;
    strategy: string;
    trafficPercent: number;
    idempotencyKey?: string;
  }) =>
    request<{ deployment: Deployment }>("/api/deployments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTraffic: (id: string, trafficPercent: number) =>
    request<{ deployment: Deployment }>(`/api/deployments/${id}/traffic`, {
      method: "PATCH",
      body: JSON.stringify({ trafficPercent }),
    }),
  promoteDeployment: (id: string) =>
    request<{ deployment: Deployment }>(`/api/deployments/${id}/promote`, {
      method: "POST",
    }),
  rollbackDeployment: (id: string) =>
    request<{ deployment: Deployment }>(`/api/deployments/${id}/rollback`, {
      method: "POST",
    }),
  retryDeployment: (id: string) =>
    request<{ deployment: Deployment }>(`/api/deployments/${id}/retry`, { method: "POST" }),
  getSnapshot: () => request<MetricSnapshot>("/api/metrics/snapshot"),
  getTimeSeries: () => request<{ series: TimeSeriesPoint[] }>("/api/metrics/timeseries"),
};
