# NeuralFlow portfolio material

## GitHub description

Local MLOps platform with immutable model versions, real Iris inference, canary/blue-green/shadow routing, persistent observability, and authenticated deployment controls.

## Resume bullets

- Built a Next.js and FastAPI MLOps platform with a PostgreSQL model registry, immutable version constraints, durable artifact storage, and SHA-256 validation.
- Implemented real inference routing across independent runtime slots, including canary allocation, blue-green switching, shadow execution, promotion, rollback, and persistent deployment history.
- Added persisted inference telemetry, latency percentiles, SLO alerts, feature mean-shift monitoring, role-based API authorization, and integration/browser tests covering the release lifecycle.

Use these only to describe work you can explain and demonstrate. Do not add invented scale, uptime, latency improvements, or business outcomes.

## LinkedIn launch draft

I built NeuralFlow to explore the engineering work that comes after training a machine-learning model.

It combines an immutable model registry, real Iris inference, canary and blue-green releases, shadow execution, promotion/rollback, and monitoring based on persisted requests. The control plane uses Next.js and PostgreSQL; private FastAPI runtimes execute predictions.

The most useful lessons were keeping serving state durable, distinguishing configured traffic from measured traffic, and testing that promotion and rollback actually change the version returning predictions. I also learned why feature drift should not be presented as model accuracy.

The video walks through the lifecycle in a local Docker Compose environment. This is a portfolio demonstration, with security and production limitations documented in the repository.

Repository: https://github.com/sniiitik/NeuralFlow
Video: <add the reviewed recording link before publishing>

## Interview explanation

### 30 seconds

“NeuralFlow is a local MLOps platform that manages the lifecycle after model training. I can register immutable model versions, verify their artifacts, run real predictions, release a candidate through controlled traffic routing, monitor persisted requests, and promote or roll back. Next.js handles the control plane and gateway, PostgreSQL holds durable state, and two private FastAPI runtimes serve the included Iris models.”

### 2 minutes

“Training a model leaves several operational questions: which version is serving, whether its artifact is intact, how to test a replacement, and how to reverse a release. I built NeuralFlow around those questions.

A model family has immutable versions, each with artifact metadata and a checksum. Deployment preparation loads a validated version into a runtime and verifies readiness. PostgreSQL stores the active, candidate, and previous route references, so promotion and rollback affect real serving behavior and survive process restarts.

The gateway supports weighted canary requests, a blue-green switch, and shadow execution whose response is never returned in place of the stable response. Every execution has a request ID and records its outcome and timing. Monitoring calculates throughput, error rates, and percentiles from those records. Iris drift compares observed feature means with the training scaler reference, with a minimum sample requirement.

Authentication and role checks protect the control plane. An optional local generator uses the configured administrator account to send real requests through the same gateway. I verified the lifecycle using integration tests and browser workflows. The deployment topology is intentionally fixed and local; distributed coordination, stronger operational security, and production ingress would need further work.”

### Deep technical explanation

Explain the boundaries in `architecture.md`, then follow one request: authenticated session → input schema → persisted family route → weighted selection → runtime health/model load → coefficient-based inference → response validation → execution/feature persistence → windowed aggregation. Explain transactional advisory locking during deployment changes, immutable-version constraints, checksummed local artifacts, retained rollback references, and the difference between candidate attempts, shadow executions, and terminal primary requests.

Describe observed evidence from `release-verification.md`, including its actual sample size, tolerance, and test conditions. Treat the local results as correctness evidence, not a production capacity benchmark.

## Likely questions

**Why FastAPI?** Python is a natural boundary for model tooling. FastAPI provides typed request validation and a small HTTP interface. The supported runtime uses explicit arithmetic over validated JSON, avoiding executable deserialization.

**Why PostgreSQL?** Model identities, versions, deployments, sessions, and event history need relationships and durable constraints. Transactions, unique constraints, advisory locks, and SQL aggregation also support consistent releases and telemetry.

**Why two runtimes?** Independent blue/green slots let stable and candidate coexist and be probed separately. They are fixed processes that can cache multiple version identities; this is not one container per model or an autoscaling system.

**How does canary routing work?** The gateway reads the family route and chooses stable/candidate according to its configured weight. Actual execution records measure distribution. Correlation/request identity is separate from authorization. A failing candidate can fall back to stable, with both attempts accounted for correctly.

**How does shadow work?** The stable request produces the user response. Eligible candidate execution is bounded by time/concurrency limits and records its own outcome. It never replaces the stable response, although bounded mirror work can still add gateway wall-clock cost. There is no durable asynchronous queue.

**How does rollback work?** The route retains previous version and slot references. A validated rollback updates durable serving state under concurrency controls. New requests resolve the restored version; immutable model records remain unchanged.

**Where does telemetry come from?** Gateway execution records are persisted in PostgreSQL. A worker checks runtime health and thresholds. Snapshot/time-series APIs aggregate real rows; generated traffic uses the normal authenticated user classification.

**How is drift measured?** Maximum standardized absolute mean shift over four Iris features, using training scaler means/scales and a 30-sample minimum. It can miss changes that preserve the mean. No ground-truth labels are collected, so it does not measure accuracy.

**Why is this not production-ready?** Fixed topology, process-local limits/caches, no reviewed public ingress or high availability, limited identity/tenant controls, local artifact storage, remaining dependency advisories, and historical migration limitations. Documented tests are not penetration testing or security certification.

**How could Kubernetes replace Compose?** A future orchestration adapter could prepare versioned workloads, verify their readiness, and provide addresses to the routing layer. The registry, artifact identity, event model, and promotion contract could remain. Scheduling, network policy, credentials, reconciliation, and autoscaling would need explicit design and verification; Kubernetes alone would not solve them.
