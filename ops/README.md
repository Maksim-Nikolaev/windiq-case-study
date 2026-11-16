# Operations

This file describes how the service is deployed and how it is monitored.

State on 16.11.2026: the stack runs at https://windiq.rombikro.com since 20:01 CET. The alert rules are live in Grafana, and Uptime Kuma has the heartbeat push monitor and the keyword monitor on `/api/status`. An alert drill on the same evening stopped the API for 7 minutes: both Kuma monitors and both ingest rules fired, and all of them recovered after the restart. There is no monitor outside the server.

## What is monitored

| Signal                                | Where                                                                                        | Alert                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Age of the latest valid hour          | Prometheus metric `windiq_latest_valid_measurement_timestamp_seconds`                        | Message to the owner, when older than 150 minutes for 5 minutes |
| Time since the last successful ingest | Prometheus metric `windiq_last_successful_poll_timestamp_seconds`                            | Message to the owner, when older than 15 minutes for 2 minutes  |
| Rejected measurement rows             | Prometheus counter `windiq_measurement_rows_total{change="rejected"}`, each row one time     | Message to the owner (info)                                     |
| Rejected master data                  | Prometheus gauge `windiq_master_data_rejected{kind}`                                         | Message to the owner (warning), at once                         |
| Dead-man switch                       | The API calls `HEARTBEAT_PUSH_URL` after each cycle without a failed run                     | Uptime Kuma push monitor, alert after 3 missed minutes          |
| Public page                           | Uptime Kuma keyword monitor on `/api/status` for `"dataFreshness":"fresh"`                   | Message to the owner                                            |
| Upstream API                          | `windiq_upstream_requests_total{path,status}` and `windiq_upstream_request_duration_seconds` | Dashboard only                                                  |
| Logs                                  | JSON lines (pino) to Loki through Alloy, label `project=windiq`                              | –                                                               |

The dead-man switch also starts an alert when the WindIQ API fails for 3 minutes, because a cycle with a failed run sends no heartbeat. This is intentional. The age of the latest valid hour counts only hours with a valid wind speed, so a source that sends `null` for each hour also starts the alert.

The alert rules are in `grafana/windiq-alerts.yml`. Grafana, Loki and Uptime Kuma are reachable only in the private network. The public page `/status` shows the same state to a reviewer.

## Endpoints

- `/api/healthz` – the process answers.
- `/api/readyz` – the process reaches the database. Docker and Traefik use this endpoint. It does not depend on the WindIQ API, so an upstream outage does not remove the dashboard.
- `/api/status` – age of the latest valid hour, rejected master data, the last 30 ingest runs and the failure count of the last 24 hours.
- `:9464/metrics` – Prometheus metrics. This port is not public.

## Delivery

1. A push to `main` starts `.github/workflows/ci.yml`: lint, type check, unit tests, integration tests against PostgreSQL, browser tests against the production images.
2. The `image` job pushes `windiq-api` and `windiq-web` to GHCR with the tags `main` and `sha-<short>`.
3. The reconciler of my server platform pulls the new images within 2 minutes. It runs the `migrator` first. A failed migration keeps the previous release.

Rollback or release freeze: set `IMAGE_TAG=sha-<short>` in the server `.env`. The reconciler then keeps this image.

## Hosting

The application runs on my own server, next to my other applications. A private platform repository holds the server side: the deploy key, the secrets in a server `.env` (never in this repository), the reconciler entry, the deployed copy of the alert rules and the Uptime Kuma monitors.

The contract with the platform is `compose.prod.yml`: the Traefik labels for `windiq.rombikro.com`, the networks `edge` and `observability`, the Prometheus labels and a healthcheck on each service that serves traffic. On each change, the reconciler copies `compose.yml` and `compose.prod.yml` from `main`, pulls the images, runs the migrator, recreates `api`, waits for its healthcheck, and then starts the other services.

The API runs as one instance, because the ingest scheduler must run one time only. A deploy therefore interrupts the API and the page for a few seconds; the browser reconnects the event stream by itself.
