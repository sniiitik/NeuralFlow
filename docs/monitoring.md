# Phase 6 inference monitoring

Operational monitoring reads persisted `InferenceRequest` rows. A primary request contributes one terminal row: a success, or a failed stable attempt after no successful fallback. Candidate failures before stable fallback and shadow attempts are retained for routing inspection but excluded from user-facing throughput and success SLOs. This counts separate calls even when a client reuses its sticky routing request ID. New rows include gateway duration, runtime inference duration, validated Iris features, and `user` or `demo` origin. Historical rows have no feature vector or gateway duration; latency uses their recorded runtime duration when present.
Requests rejected before a model family or deployment can be resolved are not included in this inference SLO; API ingress telemetry is a separate future concern.

The snapshot uses a rolling **five-minute** window. RPS is terminal primary attempts divided by 300 seconds. Error rate is failed terminal attempts divided by total terminal attempts. p50, p95, and p99 use PostgreSQL `percentile_cont` over successful primary gateway times. The time-series endpoint groups the last 12–120 minutes into one-minute buckets; empty buckets have zero throughput and no latency or error-rate value. The SSE endpoint pushes a fresh snapshot every two seconds; the UI falls back to polling when disconnected.

Both private runtimes are probed via `/readyz`; each slot's latest probe is stored in a one-minute `RuntimeHealthSample` bucket. The Compose `monitor` worker evaluates snapshots and alerts every 30 seconds, independently of browser activity. Alerts are deduplicated per kind and five-minute bucket in `AlertEvent`. SLO targets and alert thresholds can be set with `MONITOR_SLO_P95_MS`, `MONITOR_SLO_SUCCESS_PERCENT`, `MONITOR_DRIFT_THRESHOLD`, and `MONITOR_ALERT_MIN_REQUESTS`. Defaults are 80 ms p95, 99% success, 0.5 drift, and 20 primary requests. API snapshots also evaluate the same rules.

## Iris input drift

For the checked-in Iris logistic regression format, the reference mean and scale are the four feature statistics from the training scaler in the validated artifact. They are stored once per model version in `FeatureReference` with the 112-row training split identified by the reproducible trainer. Drift is the maximum absolute difference between observed and reference feature means, divided by the corresponding reference scale. The current score uses a 60-minute window and requires at least **30 successful primary feature vectors per version**. Chart points require 30 samples within that minute. A missing reference or too few samples produces **no score**. This detects mean shift only. It does not measure model accuracy; ground-truth labels are not collected.

## Retention and optional traffic generation

The monitor worker prunes inference requests and runtime health samples older than 30 days, and alert events older than 90 days, at most once per hour. App processes also run the same idempotent prune on predictions or snapshots. `FeatureReference`, models, artifacts, deployments, and audit records are retained. Run the worker or schedule equivalent maintenance in non-Compose environments; this is an age limit, not a hard storage quota.

For optional real local traffic, deploy an Iris model and run:

```bash
npm run traffic:demo -- --family=<serving-family-id> --count=100 --rate=1
```

The local-only script signs in with the configured administrator/operator account, submits bounded genuine predictions, and checks their responses. Requests are recorded as ordinary authenticated `user` traffic; the script cannot choose the telemetry source. `--url` must match `BETTER_AUTH_URL`. Do not interpret this traffic as production demand.
