import { initialDeployments, initialEvents, initialModels } from "./mock-data";
import type { AuditEvent, Deployment, MLModel } from "./types";

type NeuralFlowStore = {
  models: MLModel[];
  deployments: Deployment[];
  events: AuditEvent[];
};

type GlobalWithStore = typeof globalThis & {
  neuralFlowStore?: NeuralFlowStore;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getStore(): NeuralFlowStore {
  const globalStore = globalThis as GlobalWithStore;

  if (!globalStore.neuralFlowStore) {
    globalStore.neuralFlowStore = {
      models: clone(initialModels),
      deployments: clone(initialDeployments),
      events: clone(initialEvents),
    };
  }

  return globalStore.neuralFlowStore;
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addEvent(event: Omit<AuditEvent, "id" | "timestamp">) {
  const store = getStore();
  store.events.unshift({
    id: createId("evt"),
    timestamp: new Date().toISOString(),
    ...event,
  });
}
