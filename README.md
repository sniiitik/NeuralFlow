# NeuralFlow

NeuralFlow is a real-time MLOps dashboard for deploying, monitoring, and safely rolling out machine learning models with canary, blue-green, and shadow deployment workflows.

The UI is based on a dark production-ops dashboard: live metric cards, deployed model status, a canary rollout panel, and time-series monitoring charts.

## Why this is a strong portfolio project

This project shows more than CRUD. It demonstrates production engineering concepts that hiring teams care about:

- Model versioning and registry design
- Canary and rollback deployment flows
- Real-time monitoring with a live stream endpoint
- Time-series metrics and drift alerts
- Full-stack Next.js architecture with API route handlers
- Dashboard UX for technical users

## Tech stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Recharts
- Route Handlers for backend APIs
- Server-Sent Events for live metric streaming
- In-memory store for demo data

## Features

### 1. Overview dashboard

- Requests/sec
- Average latency
- Error rate
- Number of live models
- Deployed model status list
- Canary rollout card
- Throughput chart

### 2. Model registry

- View registered models
- Search and filter by status/framework
- Register a new model version
- Upload a demo model artifact and store artifact metadata
- Track model owner, runtime, replicas, drift, latency, and traffic

### 3. Deployment manager

- Create canary, blue-green, or shadow rollout
- Change traffic split
- Promote deployment
- Rollback deployment

### 4. Monitoring

- Throughput over time
- Latency over time
- Error rate over time
- Drift score over time
- Production-style alert cards

## Local setup

```bash
npm install
npm run dev
```

Open:

```txt
http://localhost:3000
```

## API endpoints

```txt
GET    /api/models
POST   /api/models

GET    /api/deployments
POST   /api/deployments
PATCH  /api/deployments/:id/traffic
POST   /api/deployments/:id/promote
POST   /api/deployments/:id/rollback

GET    /api/metrics/snapshot
GET    /api/metrics/timeseries
GET    /api/metrics/stream
```

## Suggested GitHub description

```txt
A real-time MLOps dashboard for deploying, monitoring, and safely rolling out machine learning models using canary and blue-green deployments.
```

## Suggested LinkedIn post

I built NeuralFlow, a real-time MLOps dashboard for teams shipping machine learning models to production.

The project covers:
- Model registry, artifact metadata, and version tracking
- Canary, blue-green, and shadow deployments
- Live latency, throughput, and error-rate monitoring
- Drift score alerts
- Rollback and promotion workflows

I wanted to build something closer to real production tooling instead of a typical CRUD app. The stack is Next.js, TypeScript, Tailwind CSS, Recharts, and API Route Handlers.

GitHub: <your repo link>

## How to push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: build NeuralFlow dashboard"
git branch -M main
git remote add origin https://github.com/<your-username>/neuralflow.git
git push -u origin main
```

## Next improvements

- Replace in-memory store with PostgreSQL and Prisma
- Store time-series metrics in TimescaleDB
- Add Redis queue for async rollout jobs
- Add Docker Compose with model runtime containers
- Add auth and team-based permissions
- Add real model artifact uploads to object storage
