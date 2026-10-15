# NeuralFlow recording script — approximately 4 minutes 30 seconds

## Prepare before recording

The current local NeuralFlow workspace has the `neuralflow-demo-iris` family, v1 and v2 artifacts, v1 serving as stable, and a 10% v2 canary running. A fresh warm-up batch just completed with 120 genuine requests: 110 were served by stable v1 and 10 by candidate v2. This sample is real, persisted, and its observed split can change as requests age out. Reuse this active canary; do not start a duplicate rollout.

1. Confirm Docker Desktop is running and open `http://localhost:3000` in Safari or Chrome. The Compose app, PostgreSQL, monitor, and both healthy inference runtimes should already be running.
2. In Terminal, from the NeuralFlow repository, run `npm run demo:check`. It should end with `READY`. It sends one actual demo prediction, so the request count may increase slightly.
3. Sign in with the administrator account from your local `.env`. Keep `.env`, credentials, browser developer tools, and secret-bearing terminal output off screen.
4. Use the existing canary at 10%. Confirm it on **Deployments** before recording. If the application was stopped or the rollout was changed, see “Restore the recording state” below.
5. Use normal browser zoom at 1280–1440px. Start on **Overview**. Filter the Registry and Deployments pages by `neuralflow-demo-iris` to keep the walkthrough focused.
6. For fresher charts while recording, run `npm run demo:traffic -- --count=100` in Terminal immediately before you start. It sends one genuine authenticated request per second for about 100 seconds. Keep the terminal behind the browser; do not show credentials or verbose logs. Configured traffic is 10%, while observed counts vary randomly.

### Restore the recording state

If you later stop the Compose app, start it with `docker compose --profile app up -d`, then run `npm run demo:check`. The demo setup is already complete. Run `npm run demo:setup` only if models/artifacts are missing; it preserves an existing serving route and does not create a duplicate deployment. If there is no active demo rollout, open **Deployments** and:

1. In **New rollout**, set **Model** to `neuralflow-demo-iris - v1`.
2. Set **New version** to `v2`, **Strategy** to `Canary`, and candidate traffic to **10%**.
3. Click **Start rollout** and wait until the history card shows **running** and **Runtime: active**.
4. Run `npm run demo:traffic -- --count=100` to populate observed routing and recent monitoring data.

Do not reset the database, alter migrations, or run cleanup commands. Do not claim the observed split is exactly 90/10; read the measured counts on screen.

## Click-by-click route

The left sidebar is the main navigation. Use these exact pages and controls:

1. **Overview** — start here and show recent requests, healthy runtimes, active rollout, and throughput chart.
2. **Model Registry** — enter `neuralflow-demo-iris` in **Search model families**, then click the family name to open its version details. Show v1/v2, stored artifact names, and SHA-256. Close the details dialog.
3. **Inference Playground** — open **Deployed model**, choose `neuralflow-demo-iris · v1 · serving route`, click **Sample 1**, then **Predict**. Since canary routing is active, the returned model can be v1 or v2. Show the actual version in the result.
4. **Deployments** — search `neuralflow-demo-iris`. In the active card point out **Original stable v1**, **Candidate v2**, **10%** configured allocation, blue/green slots, and observed request counts. This rollout is already running; do not click **Start rollout** again.
5. **Monitoring** — show request count, throughput, latency percentiles, error rate, runtime health, and drift. Drift can say insufficient data; explain that it is not accuracy.
6. To demonstrate a real serving change, return to **Deployments**, click **Promote** on the running demo canary, then **Confirm serving change** in the dialog. Return to **Inference Playground**, select the demo serving route if needed, and click **Predict**; the result should identify v2.
7. Return to **Deployments**, click **Rollback**, then **Confirm serving change**. In **Inference Playground**, run another prediction; the result should identify v1.
8. Finish at **Audit History** or **Overview**. If you want the canary visible at the end of recording, create another 10% v1→v2 canary after the rollback by following “Restore the recording state.”

## Timed walkthrough

| Time | Screen actions | Suggested voiceover |
|---|---|---|
| 0:00–0:20 | Show Overview. Move slowly across metrics without clicking. | “Training a machine-learning model is only part of getting ML into production. NeuralFlow focuses on what happens afterward: versioning, deployment, inference, controlled rollouts, monitoring, and rollback.” |
| 0:20–0:45 | Show the rendered architecture diagram. Trace the browser, Next.js gateway, PostgreSQL, and both runtimes. | “Next.js provides the control plane and prediction gateway. PostgreSQL stores model versions, serving routes, and operational history. Two private FastAPI runtimes execute predictions, and a worker checks health and alert thresholds.” |
| 0:45–1:15 | Registry → search `neuralflow-demo-iris` → open details. Show v1 and v2, artifact name and SHA-256. | “Each family can have multiple immutable versions. These two Iris models were trained reproducibly. Artifacts are stored durably and checked against SHA-256 when retrieved. A release changes routing; it does not overwrite the model version.” |
| 1:15–1:45 | Playground → select the demo **serving route**, choose Sample 1, Predict. Show output and expand JSON briefly. | “This is an actual prediction from the private runtime. The result includes class probabilities, the version that served it, a request ID, and measured inference time. Probabilities are estimates from the model; they are not an accuracy score.” |
| 1:45–2:30 | Deployments → filter demo family → show active canary. Point to configured 10%, stable/candidate versions, slots, then observed counts. Show traffic terminal briefly. | “The rollout is configured to send ten percent of requests to v2. These counts show what the gateway actually served. Random allocation varies, especially with a small sample. The traffic generator calls the same authenticated gateway and executes real predictions.” |
| 2:30–2:55 | Monitoring → throughput, percentiles, source labels, runtime health; scroll to drift. | “Monitoring is calculated from persisted inference records. Here are throughput, latency, errors, and runtime readiness. Iris drift compares observed feature means with the training reference. It needs enough samples and measures input shift, not prediction accuracy.” |
| 2:55–3:25 | Return to the active canary. Promote → read confirmation → confirm. Playground → refresh route options if needed → Predict. Point at **v2** result. | “Promotion verifies the candidate and changes the serving route. The next prediction identifies v2, so this is a real serving change. The previous stable version is retained for rollback.” |
| 3:25–3:50 | Deployment → Rollback → confirm. Playground → Predict again. Point at **v1**. | “Rollback restores the previous route. This request is now served by v1 again. The deployment and audit records preserve what happened.” |
| 3:50–4:10 | Create a **Shadow** rollout v1 → v2 with 100% mirror rate. Predict once. Inspect recorded requests for stable/shadow rows. | “Shadow mode executes the candidate separately while returning only the stable response. Candidate results and errors are recorded independently. Blue-green is also supported: prepare a standby runtime, then switch the serving route.” |
| 4:10–4:30 | Show Audit History, then Overview. | “NeuralFlow demonstrates an end-to-end ML operations lifecycle—from model registration and real inference to controlled deployment, observability, promotion, and rollback. It is a local portfolio system with documented production limitations.” |

## Recording notes

- If the first canary prediction comes from v2, explain that it is part of the ten-percent allocation; do not retake merely to hide the result.
- Perform each sensitive action only after confirming the correct demo family. Avoid double clicks while the runtime is preparing.
- If both strategies would overrun the video, demonstrate shadow and explain blue-green in one sentence. The full acceptance suite verifies both.
- An insufficient-data drift state is valid. Do not call it a failure or invent a score.
- API round-trip time, runtime computation time, and gateway p95 are different measurements; use the labels shown.
- Do not show credentials, cookies, `.env`, raw Docker environment output, secret-bearing commands, or internal tokens. Request IDs and artifact checksums are safe technical metadata.
- After recording, optionally roll back the demo shadow rollout to v1. Preserve the history; no reset is necessary.
