# Phase 5 advanced inference routing

## Fixed runtime topology

Compose defines two private FastAPI inference slots: blue (`inference`, host loopback port 8001) and green (`inference-green`, host loopback port 8002). Neither service receives database credentials or arbitrary commands. The Next.js gateway is the only public prediction entry point. Each model version is a checksum-verified, constrained Iris JSON artifact. The control plane loads the stable version into the active slot and the candidate into the other slot, then checks the exact version ID and checksum before activating a deployment.

`ServingRoute` stores the active and candidate version IDs, their distinct slots, traffic or mirror percentage, deployment ID, and revision in PostgreSQL. Promotion switches the active version and slot together in one transaction. A promoted deployment stores the route revision, so rollback is accepted only while that exact promotion remains the current serving route. The previous slot and model stay available for rollback. A runtime restart clears its cache; the gateway reloads the registered artifact on the next prediction. No user input controls Docker operations or runtime addresses.

## Strategies

- **Canary:** Each family prediction gets a request ID. The first 32 bits of its SHA-256 digest map uniformly to [0, 100). Values below the configured candidate percentage go to the candidate slot; all others go to the stable slot. Reusing a request ID gives a sticky choice for that route revision. The gateway checks runtime health and validates the returned version. If the candidate fails, it records the failed attempt and serves the stable version if healthy.
- **Blue-green:** Candidate traffic stays at 0% while the candidate is loaded and checked in the other slot. The traffic slider is disabled for this strategy. Promotion atomically changes the active slot and version; rollback restores the previous slot and version.
- **Shadow:** The stable result is always returned. The configured percentage is a **mirror rate**, not primary candidate traffic. For selected requests the gateway makes a separate candidate prediction, records its version, result, probabilities, timing, and status, and discards that result from the user response. Shadow failures cannot replace the stable result. The gateway limits shadow work to eight concurrent calls per app process and gives the runtime call a 750 ms timeout; excess requests are recorded as skipped. This V1 implementation waits for the bounded mirror attempt before returning the stable result, so shadow latency may add up to that bound.

For every family-route prediction, `InferenceRequest` records the actual attempted version, slot, role, status, prediction, and inference time. No synthetic request totals are used. The deployments dashboard polls every five seconds and displays successful stable/candidate counts, the measured candidate percentage, and shadow successes/failures/skips. Counts cover the full lifetime of each deployment, including before promotion.

## API

| Endpoint | Behavior |
| --- | --- |
| `POST /api/deployments` | Create canary, blue-green, or shadow deployment with `trafficPercent`. Blue-green always starts at 0%; shadow uses the value as mirror rate. |
| `PATCH /api/deployments/{id}/traffic` | Adjust canary traffic or shadow mirror rate. Blue-green rejects intermediate percentages. |
| `POST /api/deployments/{id}/promote` | Verify candidate slot and switch actual serving configuration. |
| `POST /api/deployments/{id}/rollback` | Verify previous slot and restore actual serving configuration. |
| `POST /api/inference/predict` | Predict through `familyId`; response includes the actual version, slot, serving role, route revision, and fallback flag. |
| `GET /api/deployments/{id}/requests?role=shadow&limit=25` | Retrieve up to 100 observed attempts, including independent shadow results and errors. |

The existing `deploymentId` direct-version prediction contract remains available for Phase 3 compatibility. It uses the blue runtime and does not participate in family traffic routing.

## Migration and verification

`prisma/migrations/20261014_z_advanced_routing/migration.sql` adds runtime slots and the request ledger. Existing routes retain the blue active slot. Any unfinished Phase 4 candidate is assigned green and reloaded before use. Previous versions, artifacts, events, and deployments remain untouched.

```bash
docker compose --profile inference up -d --build postgres inference inference-green
npm run db:deploy
TEST_DATABASE_URL='postgresql://neuralflow:neuralflow@localhost:5432/neuralflow_phase2_test' npm run test:routing
```

The routing test registers two real trained Iris versions in an isolated database, sends 1,000 real requests at 10% canary weight, checks a 65–135 candidate count tolerance, then tests candidate failure fallback, promotion, rollback, blue-green switching across a fresh control-plane process, and independent shadow execution and failure isolation. The 65–135 band is ±3.5 percentage points around the 100 expected candidate requests, about 3.7 binomial standard deviations at n=1,000.

**Fresh database setup:** The Phase 4 directory `20261014_deployment_lifecycle` sorts before the Phase 2 directory `20261014_registry`, although it depends on `RegistryDeployment`. Use `npm run db:init` for a completely empty database; it executes the unchanged migration SQL in dependency order and records the original migrations through Prisma. Existing databases continue to use `npm run db:deploy`. See [migrations.md](migrations.md) for the safety checks and remaining `migrate dev` limitation.

## Current limits

This is a fixed two-slot local topology, not autoscaling or a scheduler. Each slot can cache multiple versions; slot separation is by service process, not by per-model container. Shadow concurrency is bounded per app process, so multiple app replicas each have their own limit. Inference requests are retained for 30 days by the monitoring worker. Better Auth protects deployment controls; production object storage and distributed quotas remain future work.
