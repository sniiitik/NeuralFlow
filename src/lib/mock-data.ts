import type { AuditEvent, Deployment, MLModel } from "./types";

export const initialModels: MLModel[] = [
  {
    id: "model_fraud_detector",
    name: "fraud-detector",
    version: "v2.4.1",
    framework: "XGBoost",
    status: "live",
    owner: "Risk Platform",
    description: "Real-time transaction fraud scoring model.",
    runtime: "cpu-medium",
    replicas: 4,
    artifactName: "fraud-detector-v2.4.1.xgb",
    artifactSizeKb: 18432,
    trafficPercent: 100,
    requestsPerSecond: 142,
    avgLatencyMs: 36,
    errorRate: 0.21,
    driftScore: 0.12,
    createdAt: "2026-05-01T16:05:00.000Z",
    lastDeployedAt: "2026-05-22T18:10:00.000Z"
  },
  {
    id: "model_recommender",
    name: "recommender",
    version: "v2.0.0",
    framework: "PyTorch",
    status: "canary",
    owner: "Growth ML",
    description: "Personalized recommendation ranking model.",
    runtime: "gpu-small",
    replicas: 3,
    artifactName: "recommender-v2.0.0.pt",
    artifactSizeKb: 92744,
    trafficPercent: 20,
    requestsPerSecond: 91,
    avgLatencyMs: 41,
    errorRate: 0.3,
    driftScore: 0.18,
    createdAt: "2026-05-09T12:35:00.000Z",
    lastDeployedAt: "2026-05-26T19:55:00.000Z"
  },
  {
    id: "model_churn_predictor",
    name: "churn-predictor",
    version: "v3.1.2",
    framework: "sklearn",
    status: "rolling",
    owner: "Lifecycle",
    description: "Predicts customer churn risk for retention campaigns.",
    runtime: "cpu-small",
    replicas: 2,
    artifactName: "churn-predictor-v3.1.2.joblib",
    artifactSizeKb: 6230,
    trafficPercent: 55,
    requestsPerSecond: 34,
    avgLatencyMs: 52,
    errorRate: 0.42,
    driftScore: 0.21,
    createdAt: "2026-04-18T13:25:00.000Z",
    lastDeployedAt: "2026-05-26T18:20:00.000Z"
  },
  {
    id: "model_nlp_classifier",
    name: "nlp-classifier",
    version: "v0.8.3",
    framework: "BERT",
    status: "shadow",
    owner: "Support AI",
    description: "Classifies inbound support tickets into routing groups.",
    runtime: "gpu-small",
    replicas: 1,
    trafficPercent: 0,
    requestsPerSecond: 22,
    avgLatencyMs: 76,
    errorRate: 0.55,
    driftScore: 0.28,
    createdAt: "2026-05-12T09:10:00.000Z",
    lastDeployedAt: "2026-05-24T10:40:00.000Z"
  },
  {
    id: "model_pricing_ranker",
    name: "pricing-ranker",
    version: "v1.6.0",
    framework: "TensorFlow",
    status: "live",
    owner: "Marketplace",
    description: "Ranks dynamic pricing suggestions by expected conversion.",
    runtime: "cpu-large",
    replicas: 3,
    trafficPercent: 100,
    requestsPerSecond: 64,
    avgLatencyMs: 48,
    errorRate: 0.18,
    driftScore: 0.09,
    createdAt: "2026-03-28T15:45:00.000Z",
    lastDeployedAt: "2026-05-18T17:00:00.000Z"
  },
  {
    id: "model_anomaly_guard",
    name: "anomaly-guard",
    version: "v1.1.4",
    framework: "XGBoost",
    status: "live",
    owner: "SRE ML",
    description: "Detects abnormal metric patterns in customer workloads.",
    runtime: "cpu-medium",
    replicas: 2,
    trafficPercent: 100,
    requestsPerSecond: 28,
    avgLatencyMs: 31,
    errorRate: 0.16,
    driftScore: 0.07,
    createdAt: "2026-04-04T08:05:00.000Z",
    lastDeployedAt: "2026-05-15T11:10:00.000Z"
  }
];

export const initialDeployments: Deployment[] = [
  {
    id: "dep_recommender_canary",
    modelId: "model_recommender",
    modelName: "recommender",
    fromVersion: "v1.9.0",
    toVersion: "v2.0.0",
    strategy: "canary",
    status: "running",
    trafficPercent: 20,
    stableLatencyMs: 36,
    canaryLatencyMs: 41,
    startedAt: "2026-05-26T19:55:00.000Z",
    updatedAt: "2026-05-26T20:55:00.000Z"
  },
  {
    id: "dep_churn_rolling",
    modelId: "model_churn_predictor",
    modelName: "churn-predictor",
    fromVersion: "v3.1.1",
    toVersion: "v3.1.2",
    strategy: "blue-green",
    status: "running",
    trafficPercent: 55,
    stableLatencyMs: 49,
    canaryLatencyMs: 52,
    startedAt: "2026-05-26T18:20:00.000Z",
    updatedAt: "2026-05-26T20:44:00.000Z"
  },
  {
    id: "dep_nlp_shadow",
    modelId: "model_nlp_classifier",
    modelName: "nlp-classifier",
    fromVersion: "v0.8.2",
    toVersion: "v0.8.3",
    strategy: "shadow",
    status: "running",
    trafficPercent: 0,
    stableLatencyMs: 69,
    canaryLatencyMs: 76,
    startedAt: "2026-05-24T10:40:00.000Z",
    updatedAt: "2026-05-26T19:05:00.000Z"
  }
];

export const initialEvents: AuditEvent[] = [
  {
    id: "evt_1",
    title: "Canary rollout started",
    description: "recommender v2.0.0 receiving 20% of traffic.",
    timestamp: "2026-05-26T19:55:00.000Z",
    type: "deploy"
  },
  {
    id: "evt_2",
    title: "Drift warning acknowledged",
    description: "nlp-classifier drift score moved below warning threshold.",
    timestamp: "2026-05-26T17:18:00.000Z",
    type: "alert"
  },
  {
    id: "evt_3",
    title: "fraud-detector promoted",
    description: "v2.4.1 promoted to 100% traffic after canary checks passed.",
    timestamp: "2026-05-22T18:10:00.000Z",
    type: "promote"
  }
];
