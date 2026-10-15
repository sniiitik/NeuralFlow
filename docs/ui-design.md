# Phase 8 — interface and verification

## Visual system

The application uses a black-first token system in `src/app/globals.css`: background, sidebar, surface, elevated surface, border, foreground, secondary text, one muted violet accent, and restrained semantic colors. Tables and cards use compact spacing, 6–8px corners, tabular numbers, and monospace technical identifiers. There are no remote font downloads or decorative telemetry.

The sidebar is 240px instead of 390px; the content area supports laptop layouts without oversized typography. Mobile navigation has keyboard focus containment, Escape dismissal, and focus restoration. A skip link, visible focus rings, native modal dialogs, semantic labels, reduced-motion support, and loading/error routes provide the accessibility foundation.

## Pages and interactions

- **Overview:** real five-minute request counts, throughput, p95, error rate, ready runtime probes, serving-family count, registered versions, current rollout allocation, 30-minute throughput, and recent persisted audit activity. Activity is a server-rendered snapshot refreshed on navigation; telemetry uses the existing stream/polling hooks.
- **Registry:** searchable family table, framework filter, sorting, pagination, family/version details, artifact size and SHA-256, downloads, and activation of supported versions. Registration offers existing family names, explicit immutable-version guidance, upload size validation, and useful API errors. An empty optional owner is normalized to `Unassigned`. Registration does not claim that a version is already serving.
- **Deployments:** registered candidate selection, separate version panels, lifecycle/readiness text, configured allocation distinguished from observed requests, explicit Save for traffic edits, promotion/rollback confirmation, retry, searchable paginated history, and recorded-request inspection. Actual backend confirmation precedes displayed state changes.
- **Playground:** real deployed-version selection, editable Iris examples in centimeters, two-panel input/results, probability bars, actual version, runtime identity when returned, request ID, inference time, and copyable JSON. Probability is explicitly distinguished from accuracy.
- **Monitoring:** six operational metrics, four time-series panels, runtime/SLO results, observed version distribution, drift sample sufficiency, and persisted alert events. No random data or invented comparisons are added.
- **Audit:** server-side search over the latest 100 matching events, actor/action/resource/exact UTC timestamps. Arbitrary event payloads are intentionally not sent to the browser. A recorded control request is not labeled a successful operation.
- **Settings/account:** real session identity, role, access explanation, sign-out, and supported capability information. The old Team placeholder redirects here.
- **Login:** black visual system, accessible credentials form, pending feedback, and connection/authentication errors. No public demo credentials.

Operator/admin controls are hidden or disabled for viewers. These checks improve UX; the existing authenticated API proxy remains the security boundary. No migrations, authentication rules, inference execution, model formats, or routing semantics were changed.

## Reproducible verification

Use the existing isolated database and services described in `security.md`. Never point integration suites at the primary database. The test database name must end in `_test`.

```sh
npm ci
npm run typecheck
npm run lint
npx prisma validate
npm run build
npx playwright install chromium

# Terminal 1: use your existing isolated, migrated test database.
DATABASE_URL="$TEST_DATABASE_URL" BETTER_AUTH_URL=http://127.0.0.1:3100 \
  PORT=3100 HOSTNAME=127.0.0.1 node --env-file=.env .next/standalone/server.js

# Terminal 2: TEST_DATABASE_URL must be exported and point to that same database.
npm test
npm run test:inference
SECURITY_TEST_BASE_URL=http://127.0.0.1:3100 BETTER_AUTH_URL=http://127.0.0.1:3100 npm run test:security
SECURITY_TEST_BASE_URL=http://127.0.0.1:3100 BETTER_AUTH_URL=http://127.0.0.1:3100 npm run test:ui
```

Both inference runtimes must be available with the configured internal credential. HTTP tests and browser tests provision isolated accounts and artifacts and exercise genuine predictions. They leave their audit records/test models in the disposable database; they do not reset data. The authentication limiter may reject repeated rapid test logins; allow its one-minute window to expire between repeated suites.

`tests/ui-smoke.mts` checks all seven primary pages at 1440, 1280, and 390 pixels for document overflow and captures screenshots. It tests registration, activation, promotion, v2 inference, rollback, v1 inference, viewer restrictions, mobile keyboard navigation, and login keyboard order. Screenshots default to `/private/tmp/neuralflow-phase8`; set `UI_SCREENSHOT_DIR` elsewhere if needed. It fails on browser errors or chart dimension warnings.

## Demo preparation

Use genuine registered Iris versions and the existing controlled traffic generator described in `monitoring.md`. `npm run traffic:demo -- --family=<family-id> --count=30 --rate=2` sends genuine requests using your configured administrator account. Monitoring records these as normal authenticated traffic. Do not run test fixtures against the main workspace just to fill charts.

## Known boundaries

- Chromium desktop/mobile emulation is covered; Safari, Firefox, physical devices, and a full screen-reader audit are not covered.
- Registry/deployment pagination is client-side over existing bounded API responses; audit displays the latest 100 matching records. Large-scale server pagination is outside this frontend phase.
- Alert severity/state and historical SLO comparison are not available in the existing telemetry response; the UI does not fabricate them. Settings do not provide unsupported configuration editors.
- Local runtime topology and existing security restrictions remain. The prior dependency audit reports nine high-severity advisories; this UI phase does not claim public-deployment readiness or security certification.
- The PostgreSQL driver emits an existing concurrent-query deprecation warning during integration traffic. No browser runtime errors were observed in the passing UI run.

## Verified results — 2026-10-15

- TypeScript, ESLint, Prisma schema validation, webpack production build, and application Docker build passed.
- Registry/lifecycle/routing/monitoring integration suite: **31 passed**.
- Inference suite: **7 passed**. Security suite: **3 passed**.
- Browser workflow passed: 21 primary-page viewport captures, actual UI registration and activation, canary promotion followed by a v2 prediction, rollback followed by a v1 prediction, viewer restrictions, mobile menu focus/Escape, login keyboard order, and no browser errors or Recharts dimension warnings.
- Desktop and mobile screenshots were inspected for all primary pages; laptop Overview and login/prediction results were also inspected. Wide tables use a keyboard-focusable horizontal scroll region on mobile.
- Updated localhost application authenticated successfully. A real Iris request returned `setosa`, version `v1`, request ID `2bcbedf8-ad94-440d-b298-e84d50b0f5e3`; the five-minute request count changed from **0 to 1**. The primary registry retained **8 model versions**.
- Only the app container was replaced. PostgreSQL and both healthy inference runtime containers were retained. No migrations, database resets, artifact modifications, cloud deployment, or GitHub push were performed.
