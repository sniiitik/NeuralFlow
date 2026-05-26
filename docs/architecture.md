# NeuralFlow Architecture

```mermaid
flowchart LR
  UI[Next.js Dashboard] --> API[Next.js Route Handlers]
  API --> Store[In-memory Demo Store]
  API --> Metrics[Metric Generator]
  Metrics --> SSE[Server-Sent Events Stream]
  SSE --> UI
  API --> Deployments[Deployment State Machine]
  Deployments --> Store
```

## Current demo architecture

The project is intentionally simple for a portfolio demo:

- The frontend uses client components for live dashboard interactions.
- The backend uses Next.js Route Handlers under `src/app/api`.
- The store is in memory through `globalThis`, so state persists during the local dev session.
- Live metrics are streamed using Server-Sent Events from `/api/metrics/stream`.

## Production architecture idea

For a production-grade version, evolve it into:

```mermaid
flowchart LR
  UI[Next.js Dashboard] --> API[FastAPI or Next.js API]
  API --> Postgres[(PostgreSQL)]
  API --> Redis[(Redis Queue)]
  API --> ObjectStore[(S3 Model Artifacts)]
  Redis --> Worker[Deployment Worker]
  Worker --> K8s[Kubernetes or Docker Runtime]
  K8s --> Prometheus[Metrics Collector]
  Prometheus --> Timescale[(TimescaleDB)]
  Timescale --> API
```
