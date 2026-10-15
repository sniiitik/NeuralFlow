# Phase 9 release verification

Verified locally on 15 October 2026. This is a local portfolio release, not a production certification. No GitHub push, public deployment, database reset, artifact deletion, or historical migration edit was performed.

## Results

| Gate | Actual result |
|---|---|
| `npm ci` | Passed; 559 packages installed; nine high advisories remain |
| Prisma generation and `npx prisma validate` | Passed |
| `npm run typecheck` | Passed, including final rerun |
| `npm run lint` | Passed, including final rerun |
| `npm run build` | Passed; standalone application started successfully |
| `docker compose config --quiet` | Passed |
| `docker compose build app` | Passed |
| Fresh `npm run db:init` | Passed on new `neuralflow_phase9_fresh_test`; all six migrations recorded |
| `prisma migrate status` | Up to date on the disposable database |
| Registry/lifecycle/routing/monitoring suite | 31 passed, zero failed |
| Inference integration suite | Seven passed, zero failed |
| Security suite | Three passed, zero failed; includes real authenticated HTTP operations |
| Python runtime suite | Four passed, zero failed |
| Browser suite | Passed: seven pages × three widths; registration, serving activation, promotion, v2 prediction, rollback, v1 prediction, viewer restrictions, keyboard checks |
| Browser errors | None captured by the Chromium suite |
| Environment initializer | Isolated test passed: fresh random secrets, repeat preservation, file mode 0600, no secret output |
| Demo setup | Passed on fresh and existing databases; second run preserved existing resources |
| Demo health check | READY on fresh and existing databases |
| GitHub Actions | YAML parsed locally; workflow itself has **not** run on GitHub for these changes |

The browser test initially failed to parse because two login assertions declared the same variable. That test bug was corrected and the complete suite passed on rerun. The main-container screenshot pass then exposed a timezone-dependent Overview hydration warning. Server-rendered activity timestamps now use explicit UTC; the browser suite uses America/New_York to cover a timezone different from the local host. Prediction and routing semantics are unchanged.

## Actual lifecycle evidence

The original Phase 9 HTTP acceptance workflow authenticated an administrator and the then-provisioned restricted demo account, registered the reserved Iris family, retrieved both artifacts and compared SHA-256 with the reproducible JSON files, then exercised real runtimes:

- v1 initially served actual predictions with probabilities, version, request ID, and latency.
- Canary: **300 real requests, 266 v1 and 34 v2 (11.33% candidate)**. The predeclared acceptance range was 12–48 candidate requests (4–16%), allowing sampling variation around 10%.
- Promotion: five subsequent predictions identified v2.
- Rollback: five subsequent predictions identified v1.
- Blue-green: stable response before switching, v2 after promotion, v1 after rollback.
- Shadow: ten primary responses remained v1; ten successful v2 shadow executions were separately recorded.
- All **324 primary acceptance requests** persisted with unique IDs and trusted `demo` classification. Twenty deployment events and twenty deployment audit entries were present for this family.
- The gateway process and both runtime containers were restarted. All 324 saved request IDs remained present, the serving route still selected v1/blue with no candidate, and another genuine request returned v1.
- The separate routing integration test observed **906 stable / 94 candidate** responses across 1,000 real requests.

These are local correctness measurements, not production throughput benchmarks. The 300-request HTTP canary run used concurrency one and a one-second interval. Random routing counts differ on each run. Detailed request IDs are written to ignored `var/demo/acceptance.json`; they are not necessary to publish.

## Fresh installation and migration safety

The test database was newly created, not reset. Initialization followed `docs/migrations.md`: the four historical files were applied in dependency order, tracked through Prisma, then the observability and identity migrations were deployed. Schema inspection found registry, artifact, deployment/event/audit, route, inference, feature-reference, health, alert, and Better Auth tables. Foreign keys, route traffic/slot constraints, and immutable version/artifact triggers were present; integration tests exercised duplicate-version and immutability enforcement.

The lockfile install, clean database initialization, application build/start, accounts, registration, deployment, and predictions were verified from this local checkout. A fresh clone of the remote repository cannot contain the uncommitted release work until it is reviewed and published. No claim is made that the remote checkout already includes it.

`db:init` remains exclusively for empty databases. Existing environments use `db:deploy` for pending additive migrations. Ordinary `migrate dev` shadow replay remains blocked by historical ordering. No migration file was rewritten to hide that limitation.

## Reproduce the checks

Start Docker Desktop. Keep test data separate from your normal database. The following assumes `.env` has already been prepared and normal services are available:

```sh
npm ci
npm run db:generate
npx prisma validate
npm run typecheck
npm run lint
npm run build
docker compose config --quiet
docker compose build app
# Choose a NEW unused database name; never drop or reset an existing one.
docker compose exec -T postgres createdb -U neuralflow neuralflow_release_test
# Set TEST_DATABASE_URL privately to the local URL for neuralflow_release_test.
export TEST_DATABASE_URL='<isolated-postgresql-url-ending-in-_test>'
DATABASE_URL="$TEST_DATABASE_URL" npm run db:init
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate status
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm test
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:inference
docker build --target test -t neuralflow-inference-test inference
docker run --rm neuralflow-inference-test
```

For HTTP/browser acceptance, provision accounts against that database, then run a separate built gateway in another terminal:

```sh
DATABASE_URL="$TEST_DATABASE_URL" BETTER_AUTH_URL=http://127.0.0.1:3100 npm run auth:bootstrap
DATABASE_URL="$TEST_DATABASE_URL" BETTER_AUTH_URL=http://127.0.0.1:3100 \
  PORT=3100 HOSTNAME=127.0.0.1 node --env-file=.env .next/standalone/server.js
```

In the test terminal:

```sh
export SECURITY_TEST_BASE_URL=http://127.0.0.1:3100
export BETTER_AUTH_URL=http://127.0.0.1:3100
npm run test:security
# Install Chromium once if absent; npm's Playwright dependency alone does not install it.
npx playwright install chromium
npm run test:ui
DATABASE_URL="$TEST_DATABASE_URL" npm run demo:setup
DATABASE_URL="$TEST_DATABASE_URL" npm run demo:check
node --import dotenv/config scripts/demo-acceptance.mjs
```

The acceptance script requires an `_test` URL and confirms the gateway's demo version exists in that database before release mutations. It expects the demo family initially serving v1 without an unfinished rollout. It takes about five minutes. It preserves test history and does not reset resources. After using demo setup against the test gateway, rerun it against your main gateway to refresh the ignored local demo-family identifier.

Restart persistence was checked separately by stopping/restarting the test gateway and restarting both Compose runtime containers, then comparing saved request IDs and serving-route fields and submitting another prediction. Restarting the runtimes briefly interrupts local serving; do it outside a recording. This is not a zero-downtime or host-disaster recovery test.

## Security and repository review

- `.env` is ignored and absent from tracked files and repository history checked locally.
- A scan of 140 tracked/nonignored source files found none of the configured long secret values; `.next/static` also contained none of those values.
- A basic scan found no private-key headers or common GitHub/AWS credential patterns. These checks are useful screening, not an exhaustive secret audit.
- Compose configuration keeps host bindings on loopback and private runtime authentication enabled.
- Demo tooling authenticates with administrator credentials and records ordinary user traffic. The request cannot choose its telemetry source marker.
- `var/demo`, artifact data, build outputs, browser reports, dumps, and `.env` are ignored. No important user file was removed.
- Nine high npm advisories remain (zero critical), including Prisma and lint-tool dependency chains. See [security.md](security.md). Do not use forced incompatible dependency downgrades.
- Python tests emit a Starlette test-client deprecation warning about its HTTP client dependency; PostgreSQL integration traffic can emit a concurrent-query deprecation warning. Neither caused test failure, but both should be revisited during dependency maintenance.
- This phase did not rerun a full independent penetration test or certify public deployment readiness.

## Start and record

For this already configured checkout:

```sh
docker compose --profile app up -d
npm run demo:setup
npm run demo:check
```

Open `http://localhost:3000` and sign in privately. Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md): establish v1 as stable, create a v2 canary at 10%, run `npm run demo:traffic -- --count=300`, and record genuine predictions, monitoring, promotion, and rollback. Run a short traffic batch immediately before recording because live metrics have a five-minute window. Setup preserves an existing rollout and does not silently return it to v1.

## Readiness and remaining limits

| Use | Assessment |
|---|---|
| Local technical demo | YES, with healthy Docker services, provisioned accounts, and fresh genuine traffic |
| GitHub portfolio | YES after reviewing and committing the accumulated repository changes; nothing was pushed |
| Resume inclusion | YES; describe implemented mechanisms and tests without invented performance claims |
| LinkedIn demonstration | YES; record the documented walkthrough and review screenshots for secrets |
| Public production deployment | NO; unresolved advisories, local credentials/topology, process-local limits, and missing production operations controls remain |

Chromium responsive and keyboard checks passed; Safari, Firefox, assistive technology coverage, and exhaustive accessibility testing remain unverified. The current CI configuration was inspected, not executed on GitHub. Backup guidance exists; disaster recovery and high availability were not certified. See README and architecture/security documentation for the full scope limits.

## Final demo state and visual review

At the time of Phase 9 verification, the main local environment had `neuralflow-demo-iris` with v1 stable and v2 at 10% canary allocation. `npm run demo:traffic -- --count=300` completed with **300 successes, zero failures: 270 v1 / 30 v2**. This is a separate real sample from the isolated acceptance test. The application container was rebuilt/restarted afterward; `demo:check` returned READY and the existing database reported all six migrations current. No PostgreSQL data was reset. The subsequent recording ended after rollback; the final screenshots capture that later state.

The browser suite captured Overview, Registry, Deployments, Playground, Monitoring, Audit, and Settings at 1440, 1280, and 390px. The final capture run reported zero browser errors. Overview, registry details, deployment allocation/counts, prediction results, monitoring charts, and a mobile deployment view were also visually inspected. Nine reviewed captures of the final local demo are in `docs/screenshots/final-demo/`; five are linked from the README. They show genuine predictions and telemetry at their capture time. Live window metrics will change as new traffic arrives.

## Files and commit review

Phase 9 changes focus on:

- `scripts/env-init.mjs`, `demo-common.mjs`, `demo-setup.mjs`, `demo-check.mjs`, `demo-acceptance.mjs`, and `generate-demo-traffic.mjs`: local credential preparation, safe demo resources, real traffic, readiness, and HTTP acceptance.
- `package.json`, `.env.example`, `.gitignore`, `.dockerignore`: discoverable commands and exclusion of local outputs/secrets.
- `README.md`, `docs/architecture.md`, `docs/api.md`, `docs/DEMO_SCRIPT.md`, `docs/portfolio.md`, this report, and monitoring/security documentation.
- `src/components/pages/overview-page.tsx`: deterministic UTC activity timestamps to eliminate Docker/browser hydration mismatch.
- `tests/ui-smoke.mts`: duplicate-variable correction and a different-timezone regression scenario.
- `src/lib/mock-data.ts`: identify the legacy metadata-only fixture; the live dashboard does not import it. Use `demo:setup` for real artifacts and inference, not the historical `db:seed:demo` fixture.

The working tree also contains extensive preexisting uncommitted Phases 1–8 work, including schema, migrations, runtime, security, UI, CI, and tests. At review time Git reported 95 modified/deleted/untracked path entries (untracked directories are grouped), with nothing staged. The existing deletion of `src/lib/store.ts` belongs to the earlier persistence work. Review the complete tree before committing; this report does not attribute all accumulated changes to Phase 9. No commit or push was made.
