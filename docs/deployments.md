# Phase 4 deployment lifecycle

## Runtime and serving route

The Compose inference service is a fixed, private FastAPI runtime. The control plane never accepts a container name, image, command, or host path from a deployment request. It reads only immutable registered model versions, verifies artifact checksums, asks the runtime to load both stable and candidate versions, and checks the exact version ID and checksum using `GET /v1/models/{version_id}/readyz`. The runtime executes the constrained Iris JSON model; it does not deserialize Python objects.

`ServingRoute` is the durable routing source of truth, one row per model family. It holds separate `activeVersionId` and optional `candidateVersionId`, the candidate deployment, traffic percentage, and a revision. `POST /api/inference/predict` with `familyId` reads this row for each request. A SHA-256 bucket of the request ID chooses the candidate for the configured percentage. A shadow rollout always receives zero user-facing traffic; it loads and verifies the candidate but does not mirror requests. The response states the actual serving version and role. Direct `deploymentId` predictions from Phase 3 remain available for explicit version testing.

## State machine and recovery

New deployments move through `pending → preparing → starting → healthy → active`. A runtime or artifact failure records `failed` and an error. Retry returns a failed deployment to `pending` and rechecks both versions. Rollback moves it to `terminated`; promotion keeps the deployed version `active` and marks the rollout completed. Deployment and audit events record each committed transition and action.

The request creates a durable pending row first. Reconciliation commits each intermediate state separately, loads and checks both versions, then updates the route in a database transaction. A control-plane crash can leave a row in pending, preparing, starting, or healthy; listing deployments resumes from the stored state. PostgreSQL advisory transaction locks serialize each transition by family. A second rollout for a family is rejected while a candidate or incomplete rollout exists. Idempotency keys return the original deployment for the same request body and reject reuse with different content. Promotion and rollback recheck runtime readiness before switching the route, then update the route and deployment status atomically. Rollback is also available immediately after promotion if that version is still serving.

Phase 5 adds a second fixed runtime slot, measured canary distribution, and bounded shadow mirroring; see [routing.md](routing.md). Runtime caches remain ephemeral. Reconciliation is triggered by API listing or retry, rather than a background worker. There is no autoscaling, multi-region coordination, or production-grade runtime isolation. Existing pre-Phase-4 metadata-only rollout rows remain historical with a null lifecycle state. The migration backfills routes only from previous successful inference activations.

## API

| Endpoint | Behavior |
| --- | --- |
| `POST /api/deployments` | Create and reconcile a rollout: `modelId` is the stable version ID, `toVersion` is the registered candidate version name in the same family, `strategy` is canary, blue-green, or shadow, `trafficPercent` is 0–100, and optional UUID `idempotencyKey` deduplicates retries |
| `GET /api/deployments` | Reconcile pending rows and list persisted rollout history |
| `GET /api/deployments/{id}` | Get persisted rollout details and lifecycle state |
| `PATCH /api/deployments/{id}/traffic` | Change active candidate traffic with `{"trafficPercent": 0..100}` |
| `POST /api/deployments/{id}/promote` | Verify candidate readiness and route 100% to it |
| `POST /api/deployments/{id}/rollback` | Verify stable readiness and route 100% back to it |
| `POST /api/deployments/{id}/retry` | Retry a failed deployment if its stable route is unchanged |
| `POST /api/inference/predict` | Predict through a family route with `{"familyId":"...","features":{...}}` or target an activated Phase 3 deployment with `deploymentId` |

Example, assuming `V1_ID`, `FAMILY_ID`, and registered v2 from [inference.md](inference.md):

```bash
DEPLOYMENT_ID=$(curl -fsS -X POST http://localhost:3000/api/deployments \
  -H 'Content-Type: application/json' \
  -d "{\"modelId\":\"$V1_ID\",\"fromVersion\":\"v1\",\"toVersion\":\"v2\",\"strategy\":\"canary\",\"trafficPercent\":0,\"idempotencyKey\":\"$(uuidgen)\"}" | jq -r '.deployment.id')
curl -fsS -X POST http://localhost:3000/api/inference/predict \
  -H 'Content-Type: application/json' \
  -d "{\"familyId\":\"$FAMILY_ID\",\"features\":{\"sepal_length\":5.1,\"sepal_width\":3.5,\"petal_length\":1.4,\"petal_width\":0.2}}"
curl -fsS -X PATCH "http://localhost:3000/api/deployments/$DEPLOYMENT_ID/traffic" \
  -H 'Content-Type: application/json' -d '{"trafficPercent":100}'
curl -fsS -X POST "http://localhost:3000/api/deployments/$DEPLOYMENT_ID/promote"
curl -fsS -X POST "http://localhost:3000/api/deployments/$DEPLOYMENT_ID/rollback"
```

## Migration and tests

`prisma/migrations/20261014_deployment_lifecycle/migration.sql` adds the lifecycle enum and fields to `RegistryDeployment`, creates `ServingRoute` with route checks and foreign keys, and backfills prior inference activations. It does not delete, reset, or rewrite historical rows.

```bash
npm run db:deploy
TEST_DATABASE_URL='postgresql://neuralflow:neuralflow@localhost:5432/neuralflow_phase2_test' npm test
TEST_DATABASE_URL='postgresql://neuralflow:neuralflow@localhost:5432/neuralflow_phase2_test' npm run test:inference
```

The lifecycle test uses real Iris artifacts and private runtime calls, then asserts actual prediction versions before and after traffic, promotion, and rollback. It also checks idempotency, conflicts, failure/retry, persisted events, and a fresh control-plane process.
