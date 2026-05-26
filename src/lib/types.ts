export type ModelStatus = "live" | "canary" | "rolling" | "shadow";
export type ModelFramework = "PyTorch" | "TensorFlow" | "XGBoost" | "sklearn" | "BERT";
export type DeploymentStrategy = "canary" | "blue-green" | "shadow";
export type DeploymentStatus = "pending" | "running" | "completed" | "rolled_back";

export type MLModel = {
  id: string;
  name: string;
  version: string;
  framework: ModelFramework;
  status: ModelStatus;
  owner: string;
  description: string;
  runtime: string;
  replicas: number;
  artifactName?: string;
  artifactSizeKb?: number;
  trafficPercent: number;
  requestsPerSecond: number;
  avgLatencyMs: number;
  errorRate: number;
  driftScore: number;
  createdAt: string;
  lastDeployedAt: string;
};

export type Deployment = {
  id: string;
  modelId: string;
  modelName: string;
  fromVersion: string;
  toVersion: string;
  strategy: DeploymentStrategy;
  status: DeploymentStatus;
  trafficPercent: number;
  stableLatencyMs: number;
  canaryLatencyMs: number;
  startedAt: string;
  updatedAt: string;
};

export type MetricSnapshot = {
  requestsPerSecond: number;
  avgLatencyMs: number;
  errorRate: number;
  modelsLive: number;
  rollingOut: number;
  driftAlerts: number;
  generatedAt: string;
};

export type TimeSeriesPoint = {
  timestamp: string;
  label: string;
  throughput: number;
  latency: number;
  errorRate: number;
  driftScore: number;
};

export type AuditEvent = {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: "deploy" | "promote" | "rollback" | "model" | "alert";
};
