# WindIQ case study – live yield calculation

The application fetches the hourly measurements of a met mast from the WindIQ API, calculates the annual energy production (AEP gross, AEP net, P50, P90) and shows the result. The page updates without a reload when new data arrives.

- Application: https://windiq.rombikro.com
- Operating state: https://windiq.rombikro.com/status
- API documentation: https://windiq.rombikro.com/api/docs

## Architecture

```
WindIQ API ──poll 60 s──▶ api (Hono, Node.js) ──▶ PostgreSQL
                           └──REST + Server-Sent Events──▶ web (Next.js) ──▶ browser
```

- `apps/api` – ingest, calculation, read-only API, event stream and metrics (TypeScript, Hono, Zod, Drizzle, PostgreSQL 18).
- `apps/web` – the dashboard in German, with three views of the same result (Gutachter, Projektierer, Bank) and the status page (Next.js 16).
- `apps/fake-upstream` – a test double of the WindIQ API with fault switches.
- `ops/` – alert rules and the operations notes. `bruno/` – requests for both APIs.

The browser never calls the WindIQ API: the credentials stay on the server, and the page shows stored data when the source is down. Zod schemas validate each response of the source and define each response of the API; the OpenAPI specification and the types of the web app come from these schemas.

## Calculation

The formulas are the formulas of the task.

1. `v_hub = v_measured × (h_hub / h_measured) ^ α`
2. Power from the power curve, linear between the points. Energy per hour = power × 1 h.
3. `AEP gross` = sum over the last 12 months, in MWh.
4. `AEP net = AEP gross × (1 − availability) × (1 − electrical) × (1 − wake)`
5. `P50 = AEP net`, `P90 = P50 × (1 − 1.282 × U)`

Assumptions that the task does not define:

- **Window:** the 12 months up to the latest delivered hour (UTC)
- **Missing or invalid hours** are filled, so that the sum covers the full year. A gap of up to 3 hours gets a wind speed interpolated linearly between the neighbouring hours. A longer gap gets the mean energy of the valid hours of the same calendar month. The page shows the coverage and the number of filled hours.
- **Cut-in and cut-out:** 0 kW below cut-in and above cut-out.
- **Values:** `km/h`, `kn` and `mph` become m/s. Values below 0 or above 50 m/s, and unknown units, are invalid.
- **Timestamps** become UTC hours. A row without a time zone, not on a full hour or in the future is rejected.
- **Corrections:** the highest `version` wins; all versions are kept.
- **Master data:** a new site or turbine version starts a new calculation. An implausible version is stored but not used, and an alert starts.
- **Full-load hours** = P50 ÷ rated power; capacity factor = full-load hours ÷ hours of the window.

## Reliability

- The poll reads only changed rows (`updated_since`). Once a day a full read adds rows that the poll missed.
- Each hour is stored once. A correction replaces a value only with a higher `version`.
- A bad row is stored with its reason and never stops a run.
- When the source fails, the client retries with backoff, and the page keeps the stored result. The next good run fills the gap.
- Each of these cases has a test in `apps/api/test/`. Monitoring and delivery: [`ops/README.md`](ops/README.md).

## Run it locally

```bash
docker compose --profile fake up --build --detach --wait   # http://127.0.0.1:3091, with the fake source
pnpm check                                                 # lint, type check, unit and integration tests
pnpm e2e                                                   # browser tests against the running stack
```

To use the real API, set `LOCAL_WINDIQ_BASE_URL`, `LOCAL_WINDIQ_CLIENT_ID` and `LOCAL_WINDIQ_CLIENT_SECRET` and start the stack with `-p windiq-real`, so it gets its own database.

## Time and tools

- AI agent (Claude Code): about 3.5 h in two sessions on 16 and 17 November 2026.
- My own work (planning, decisions, analysis, review): ~1.5 hours
