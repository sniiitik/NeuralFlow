# Phase 7 security and quality gates

## Access model

Better Auth stores email/password credentials and expiring sessions in PostgreSQL. Public sign-up is disabled. On a migrated database, run `npm run auth:bootstrap` once with `NEURALFLOW_ADMIN_EMAIL` and a unique `NEURALFLOW_ADMIN_PASSWORD` of at least 16 characters. It refuses a database with existing users. Set a random `BETTER_AUTH_SECRET` of at least 32 characters and the exact browser origin in `BETTER_AUTH_URL`; never commit secrets. Sign in at `/login`. Sign-out revokes the session.

The Next.js proxy checks sessions at the HTTP boundary for all dashboard and application API routes. Admins may read and change models and deployments. Operators may do the same but cannot administer accounts. Viewers may read and predict. Previously provisioned legacy demo-role accounts may only predict; new ones are not provisioned. Missing sessions receive 401 and forbidden operations receive 403. Write requests require the configured Origin. Better Auth limits sign-in attempts, and the gateway applies a per-process write rate limit. The proxy writes denied and authorized control requests to `AuditLog`; deployment outcomes remain in `DeploymentEvent`. An authorized-request audit entry records intent, while the deployment event records outcome.

The local traffic generator uses the configured administrator/operator credentials and submits ordinary authenticated predictions. It does not accept a caller-controlled telemetry source marker. Legacy `demo` role support remains prediction-only for compatibility with existing databases and security tests; no separate demo account is provisioned. The generator requires `--family=<serving-family-id>`.

Blue and green FastAPI runtimes require `INFERENCE_RUNTIME_TOKEN` on all paths except `/healthz`. The gateway and monitoring worker receive this token. Compose binds app and PostgreSQL host ports to loopback and isolates PostgreSQL and runtimes on separate internal networks. The unauthenticated health endpoint reveals status only. TLS termination, managed secret injection, and a real network policy are needed before any public deployment.

Model uploads are capped at 16 MiB plus 1 MiB multipart overhead during streaming. JSON bodies are capped at 1 MiB. Existing artifact format and checksum checks remain in force. The runtime accepts only constrained Iris JSON and executes no pickle, arbitrary Python, or user supplied Docker commands. HTTP headers include `nosniff`, frame denial, restricted referrer and browser permissions, and a limited CSP. HSTS is emitted only when `NEURALFLOW_HTTPS=1` behind a verified HTTPS endpoint.

## Checks

Use an isolated migrated database whose name ends in `_test`. For HTTP tests, run the built app on loopback port 3100 against that database with `BETTER_AUTH_URL=http://127.0.0.1:3100` and `SECURITY_TEST_BASE_URL` set to the same URL:

```bash
npm ci
npx prisma validate
npm run typecheck
npm run lint
npm run build
TEST_DATABASE_URL=<test-url> npm test
TEST_DATABASE_URL=<test-url> npm run test:inference
TEST_DATABASE_URL=<test-url> SECURITY_TEST_BASE_URL=http://127.0.0.1:3100 npm run test:security
docker build --target test -t neuralflow-inference-test ./inference
docker run --rm neuralflow-inference-test
```

GitHub Actions runs these checks with disposable PostgreSQL and runtime services. Playwright browser workflows are available through `npm run test:ui`; see `ui-design.md`. The checked-in CI currently runs HTTP security tests; a local pass does not prove that GitHub Actions itself has run.

## Retention, recovery, and deployment limits

Inference and health telemetry retention is described in [monitoring.md](monitoring.md). Revoke sessions for compromised accounts and periodically remove expired rows. Define an organizational retention period for `AuditLog`; automatic audit-log pruning is not currently configured. Back up PostgreSQL using `pg_dump -Fc` and `ARTIFACT_STORAGE_DIR` together, encrypt both, and periodically test restore into an isolated environment. Artifact checksums and storage keys require matching restored bytes. Never run `db:init` on a populated database.

The per-process rate limit is not distributed. Compose retains fixed local development PostgreSQL credentials. Organization tenancy, MFA, managed secret rotation, distributed denial-of-service protection, and reviewed HTTPS ingress remain absent. Do not expose this Compose deployment publicly.

The October 2026 npm audit after compatible fixes reports nine high advisories through `eslint-config-next`/`fast-glob`/`micromatch`/`braces` and Prisma CLI's `@prisma/config`/`deepmerge-ts`/`mysql2` chain. `npm audit --omit=dev` still reports four high entries in the Prisma chain because the CLI is also pulled through production dependency peers. The initial critical Next.js advisory was fixed by upgrading to 16.4.0. npm proposes incompatible downgrades to Next 14 or Prisma 6 for the remaining groups. Reassess upstream fixes before public deployment; do not force incompatible downgrades.

The prior Python runtime resolved Starlette 0.46.2, for which `pip-audit` reported 14 advisory entries. FastAPI 0.143.1 and Starlette 1.8.0 passed runtime tests, and `pip-audit -r inference/requirements.txt` in the rebuilt test image reported no known vulnerabilities. Recheck on future dependency updates.
