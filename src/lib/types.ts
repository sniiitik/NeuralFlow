export type ModelStatus = "live" | "canary" | "rolling" | "shadow" | "archived";
export type ModelFramework = "PyTorch" | "TensorFlow" | "XGBoost" | "sklearn" | "BERT";
export type DeploymentStrategy = "canary" | "blue-green" | "shadow";
export type DeploymentStatus = "pending" | "running" | "completed" | "rolled_back" | "failed";

export type MLModel = {
  id: string;
  familyId?: string;
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
  artifactAvailable?: boolean;
  artifactSha256?: string;
  trafficPercent: number;
  requestsPerSecond: number;
  avgLatencyMs: number | null;
  errorRate: number | null;
  driftScore: number | null;
  createdAt: string;
  lastDeployedAt: string;
};

export type Deployment = {
  id: string;
  familyId?: string;
  lifecycleState?: "pending" | "preparing" | "starting" | "healthy" | "active" | "failed" | "terminated" | null;
  lastError?: string | null;
  modelId: string;
  modelName: string;
  fromVersion: string;
  toVersion: string;
  strategy: DeploymentStrategy;
  status: DeploymentStatus;
  trafficPercent: number;
  stableSlot?: "blue" | "green" | null;
  candidateSlot?: "blue" | "green" | null;
  observed?: {
    stable: number;
    candidate: number;
    shadow: number;
    candidateFailures: number;
    shadowFailures: number;
    shadowSkipped: number;
    candidatePercent: number;
    stableLatencyMs: number | null;
    candidateLatencyMs: number | null;
  };
  stableLatencyMs: number | null;
  canaryLatencyMs: number | null;
  startedAt: string;
  updatedAt: string;
};

export type MetricSnapshot = {
  windowMinutes: number;
  hasData: boolean;
  requestCount: number;
  successCount: number;
  failedCount: number;
  demoRequests: number;
  requestsPerSecond: number;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  errorRate: number | null;
  modelsLive: number;
  rollingOut: number;
  driftAlerts: number;
  generatedAt: string;
  slo: { successPercent: number | null; targetSuccessPercent: number; targetP95Ms: number;
    successMet: boolean | null; latencyMet: boolean | null };
  runtimeHealth: Array<{ slot: "blue" | "green"; healthy: boolean; latencyMs: number; errorCode: string | null }>;
  drift: Array<{ versionId: string; sampleCount: number; minimumSamples: number; score: number | null; referenceSource: string | null }>;
  alerts: Array<{ id: string; kind: string; message: string; observed: number; threshold: number; createdAt: string }>;
  distribution: Array<{ versionId: string; source: string; requests: number }>;
};

export type TimeSeriesPoint = {
  timestamp: string;
  label: string;
  throughput: number;
  latency: number | null;
  errorRate: number | null;
  driftScore: number | null;
};

export type AuditEvent = {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: "deploy" | "promote" | "rollback" | "model" | "alert";
};
