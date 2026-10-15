# Phase 2 registry and persistence

## Schema and migration

Migration `20261014_registry` adds `ModelFamily`, `ModelVersion`, `ModelRuntimeState`, `ModelArtifact`, `RegistryDeployment`, `DeploymentEvent`, and `AuditLog`. The pre-existing `MLModel` and `Deployment` tables are retained as `LegacyMLModel` and `LegacyDeployment` mappings in Prisma. The migration copies existing rows, retains legacy model IDs as version IDs, and creates metadata-only version placeholders for deployment version text lacking a model row. No legacy row is deleted.

| Table | Purpose | Key rules |
| --- | --- | --- |
| `ModelFamily` | Named model identity and mutable owner/description | Unique name |
| `ModelVersion` | Immutable version metadata within a family | Unique `(familyId, version)`; trigger rejects UPDATE/DELETE |
| `ModelRuntimeState` | Mutable dashboard status and observed metrics | One row per version |
| `ModelArtifact` | Immutable manifest for uploaded bytes | One per version; SHA-256 and size checks; trigger rejects UPDATE/DELETE |
| `RegistryDeployment` | Durable rollout metadata and state | Foreign keys to family, stable version, target version |
| `DeploymentEvent` | Rollout action history | References deployment |
| `AuditLog` | Registry, deployment, and security history | Security access entries record the authenticated user ID; older domain entries may retain `system` |

Archiving changes `ModelRuntimeState`, retaining the version and artifact. Only empty families can be deleted. Deployments and their events remain for history. The migration was applied to the existing local database with `npm run db:deploy`; use `npx prisma migrate status` to inspect another database before deploying.

## Artifact storage

`ARTIFACT_STORAGE_DIR` points to a persistent local directory. The optional Compose app service bind-mounts `./var/artifacts` at `/app/var/artifacts`, sharing files with the host dev server. Uploaded bytes are named by SHA-256 under a two-character prefix. Retrieval recomputes the digest and returns a checksum mismatch error if bytes differ. Database metadata and file writes are separate operations, so an interrupted or rejected registration can leave an unreferenced file. Back up both the database and artifact directory; no garbage collector exists yet.

Accepted formats:

- `.json`: at most 1 MiB, valid UTF-8 JSON object with `schemaVersion: 1` and a `model` object. It is treated as inert data.
- `.safetensors`: at most 16 MiB, with a valid header and contiguous tensor data offsets. The application validates and stores bytes without loading tensors into executable models.

All artifacts must be nonempty and at most 16 MiB. Pickle, joblib, PyTorch checkpoint, ONNX, and other formats are rejected in this phase. File extension and content are both checked. Legacy filenames and sizes are metadata only and do not imply stored bytes. The API never loads uploaded artifacts as executable code.

## API

Successful responses use `{ model }`, `{ models }`, `{ family }`, `{ families }`, `{ deployment }`, or `{ deployments }`. Errors use `{ code, error }`; Zod validation errors also include `issues`. Common codes include `validation_error` (400), `duplicate` (409), `artifact_format` (415), `artifact_size` (413), and `not_found` (404).

| Method and path | Behavior |
| --- | --- |
| `GET /api/families` | List families with version summaries |
| `POST /api/families` | Create family with `name`, `owner`, optional `description` |
| `GET /api/families/:id` | Retrieve family and versions |
| `PATCH /api/families/:id` | Update owner or description |
| `DELETE /api/families/:id` | Delete empty family only |
| `GET /api/models` | List version records in the dashboard response shape |
| `POST /api/models` | Register immutable version via JSON or multipart form with optional `artifact` |
| `GET /api/models/:id` | Retrieve a version by version ID |
| `PATCH /api/models/:id` | Archive a version; immutable metadata cannot be edited |
| `DELETE /api/models/:id` | Archive a version; retained for history |
| `GET /api/models/:id/artifact` | Download stored bytes and `X-Artifact-SHA256` |
| `POST /api/models/:id/artifact` | Attach the single artifact to a version via multipart `artifact` file |
| `GET /api/deployments` | List persisted deployments |
| `POST /api/deployments` | Create a rollout for registered stable and target versions |
| `GET /api/deployments/:id` | Retrieve persisted deployment |
| `PATCH /api/deployments/:id/traffic` | Record traffic percentage for running rollout |
| `POST /api/deployments/:id/promote` | Mark rollout completed and update runtime states |
| `POST /api/deployments/:id/rollback` | Mark rollout rolled back and update runtime states |

`POST /api/models` requires `name`, `version`, and `framework`; optional fields are `owner`, `description`, `runtime`, `replicas`, and `status`. The family is created if absent. Register another version under the same name by changing `version`; attempting the same pair again returns 409. `POST /api/deployments` accepts `modelId` (stable version ID), `toVersion` (an already registered version in that family), optional matching `fromVersion`, `strategy` (`canary`, `blue-green`, `shadow`), and `trafficPercent` from 0 to 100. Shadow rollout traffic remains zero. These operations record intended state; they do not route live traffic.

Example registration:

```bash
curl -X POST http://localhost:3000/api/models -H 'Content-Type: application/json' -d '{"name":"sample-model","version":"v1","framework":"safetensors","owner":"Local"}'
```

Example upload with the returned version ID:

```bash
curl -X POST http://localhost:3000/api/models/VERSION_ID/artifact -F 'artifact=@./model.json'
```

The dashboard continues to use its existing model/deployment response shapes. Metrics snapshot and time series read persisted inference records from PostgreSQL.
