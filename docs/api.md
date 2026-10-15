# API reference

The browser and local tooling use the same Next.js HTTP boundary. Examples below describe request shapes; IDs and values marked with angle brackets are placeholders. They are not measured responses or credentials.

## Authentication and errors

`POST /api/auth/sign-in/email` accepts `{ "email": "<provisioned email>", "password": "<private password>" }` and sets an HTTP-only session cookie. `GET /api/auth/get-session` reads the current session. `POST /api/auth/sign-out` revokes it. Better Auth owns these endpoints; public sign-up is disabled. Local administrator provisioning uses `auth:bootstrap`.

Send the session cookie and the exact configured `Origin` on mutations. Admin/operator accounts may change registry/deployment state. Viewers may read and predict. Previously provisioned legacy demo-role accounts may only predict (auth/session endpoints are still available); local setup no longer creates them. Missing session: 401; forbidden role/origin: 403; rate limit: 429. Gateway limits are per process: 120 prediction requests/minute/user and 60 other mutations/minute/user/path; login has a tighter limit.

Validation/domain failures use `{ "code": "<machine code>", "error": "<safe message>" }`, generally 400, 404, 409, 413, 415, 502, or 503. Do not rely on arbitrary error text. No client header can grant a role or classify traffic as trusted demo traffic.

## Registry

| Method and path | Behavior |
|---|---|
| GET `/api/families` | List families with version counts |
| POST `/api/families` | Create `{name, owner, description?}` |
| GET `/api/families/:id` | Family and version identities |
| PATCH `/api/families/:id` | Update family owner/description only |
| DELETE `/api/families/:id` | Delete an empty family; retained version history prevents deletion |
| GET `/api/models` | List version records with artifact/operational metadata |
| POST `/api/models` | Register an immutable version, optionally with artifact |
| GET `/api/models/:id` | Retrieve one version |
| PATCH `/api/models/:id` | Only `{ "status": "archived" }` is accepted |
| DELETE `/api/models/:id` | Soft archive; no deletion of immutable history |
| POST `/api/models/:id/artifact` | Attach a validated artifact to a version lacking one |
| GET `/api/models/:id/artifact` | Download stored bytes after SHA-256 verification |

Registration accepts JSON metadata or multipart fields `name`, `version`, `framework`, `owner`, `description`, and optional file `artifact`. Framework metadata does not imply serving support. The runtime supports only `schemaVersion: 1` with `model.type: "sklearn_iris_logistic_regression"`. Registry JSON/safetensors uploads are limited to 16 MiB; the constrained Iris runtime has a 1 MiB model limit. JSON request bodies are limited to 1 MiB. Duplicate family/version returns 409. Existing version metadata cannot be edited into a different model.

Example multipart fields:

```text
name=neuralflow-demo-iris
version=v1
framework=sklearn
owner=NeuralFlow demo
artifact=@inference/examples/iris-v1.json
```

Response: `{ "model": { "id": "<version-id>", "familyId": "<family-id>", "name": "neuralflow-demo-iris", "version": "v1", "artifactAvailable": true, "artifactSha256": "<64 hex digits>", ... } }`.

## Deployment and serving

| Method and path | Behavior |
|---|---|
| GET `/api/deployments` | Persisted deployments with observed execution counts |
| POST `/api/deployments` | Prepare/verify candidate, persist lifecycle and routing |
| GET `/api/deployments/:id` | Deployment state and observed request counts |
| PATCH `/api/deployments/:id/traffic` | `{ "trafficPercent": 10 }` candidate allocation or shadow mirror percentage |
| POST `/api/deployments/:id/promote` | Verify candidate and switch actual serving route |
| POST `/api/deployments/:id/rollback` | Restore retained stable route |
| POST `/api/deployments/:id/retry` | Retry a failed deployment |
| GET `/api/deployments/:id/requests?role=shadow&limit=25` | Actual stable/candidate/shadow execution records; limit 1–100 |
| GET `/api/inference/deployments` | Available family routes and activated versions |
| POST `/api/inference/deployments` | `{ "versionId": "<id>" }` validates/loads a version for initial/direct inference |

Create a canary:

```json
{
  "modelId": "<stable-v1-version-id>",
  "fromVersion": "v1",
  "toVersion": "v2",
  "strategy": "canary",
  "trafficPercent": 10,
  "idempotencyKey": "<new UUID>"
}
```

Both versions must belong to the same family and have supported artifacts. Strategies are `canary`, `blue-green`, or `shadow`. Blue-green begins with zero candidate traffic and is switched by promotion; arbitrary traffic edits are rejected. Invalid/conflicting transitions return 409. Reuse an idempotency key only for the same logical creation request. Promotion/rollback do not rewrite version records.

## Prediction

`POST /api/inference/predict` accepts **exactly one** of `familyId` or `deploymentId`:

```json
{
  "familyId": "<family-id>",
  "features": {
    "sepal_length": 5.1,
    "sepal_width": 3.5,
    "petal_length": 1.4,
    "petal_width": 0.2
  }
}
```

All measurements are finite numbers greater than zero and at most 20, in centimeters. A family ID exercises current routing; a specific deployment selects an activated version directly. Use family routes to demonstrate promotion/rollback.

The response includes `requestId`, `modelVersionId`, `modelVersion`, `prediction`, `probabilities`, and `inferenceMs`. Family-routed responses also include `familyId`, `servingRole`, `servingSlot`, and fallback information. Probabilities sum to approximately one; they are model estimates, not measured accuracy. `inferenceMs` is runtime computation time, while monitoring records gateway duration separately. A caller may supply `X-Request-ID`; it is correlation/sticky selection metadata, not an authentication mechanism.

## Monitoring and audit

| Endpoint | Meaning |
|---|---|
| GET `/api/metrics/snapshot` | Five-minute counts, throughput, p50/p95/p99, error rate, SLOs, runtime probes, drift, alerts, and version/source distribution |
| GET `/api/metrics/timeseries?minutes=30` | Minute buckets over an allowed 12–120 minute period |
| GET `/api/metrics/stream` | Server-sent snapshot events; authenticated session required |
| GET `/audit?q=<text>` | Server-rendered audit UI; latest 100 matching actor/action/resource records |

There is no public `/api/audit` JSON endpoint. Raw deployment events are persisted in PostgreSQL; there is currently no dedicated JSON endpoint exposing the event log. Related transition audit entries are visible in `/audit`. Audit payloads are not blindly exposed to the browser. A `security.control_request` audit event records an attempted authorized call, not proof that it succeeded.

## Internal runtime contract

Loopback development endpoints default to ports 8001 and 8002. `/healthz` is status-only and public. `/readyz`, model loading/readiness, and `/v1/predict` require `X-NeuralFlow-Runtime-Token`. These are internal calls made by the control plane/worker, not browser APIs. Never place the token in public environment variables or client code.
