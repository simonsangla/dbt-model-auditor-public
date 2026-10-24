# Snowflake & dbt Auditor (`apps/dbt-model-auditor`)

A read-only audit of one Snowflake schema that holds dbt models, plus an optional
analysis of a `manifest.json`. Next.js app; runs locally, in Docker, or as a
Snowflake app.

## What it does (and only this)

| Surface | Route | Reads |
|---|---|---|
| dbt Model Auditor | `/` | `INFORMATION_SCHEMA.TABLES` of the configured schema, and `SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY` for the two query checks |
| Manifest analysis | `/` (panel) | an uploaded dbt `target/manifest.json`, parsed by the app's own `/api/manifest` route and not stored |
| Cortex metadata | `/cortex` | `SHOW CORTEX SEARCH SERVICES` and `SHOW SEMANTIC VIEWS` in the configured schema |
| Cortex LLM analysis | `/cortex` (tab 2) | sends SQL you paste to `SNOWFLAKE.CORTEX.COMPLETE`. **Consumes Cortex credits**; only runs when you click |
| Snowsight SQL battery | `/battery` | a SELECT/SHOW-only script to paste into Snowsight when the app cannot reach the account |

Audit checks: `empty-model`, `stale-model` (base tables only), `missing-clustering`
(>100 MB, no clustering key), `no-primary-key` (base tables, info only: Snowflake
does not enforce keys), `recent-failure` and `slow-query` (both need
`ACCOUNT_USAGE`). Manifest checks: test coverage, doc coverage, naming prefixes,
non-staging models that depend directly on a source.

Scope: without a manifest, "dbt model" means any table or view in the configured
schema, because Snowflake metadata carries no dbt identity. Upload the project's
`manifest.json` and the audit covers **dbt models only**: each model node is matched
to a Snowflake object by `database`, `schema` and `alias` (case-insensitive;
ephemeral models build nothing and are skipped). Objects no model builds are listed
separately, and a model the manifest builds into the schema but Snowflake does not
have becomes a `dbt-model-not-built` warning. If the manifest builds nothing into the
audited schema, the page says so and keeps the full audit.

## Behaviour on failure

- No connection configured: the app asks you to configure one. It never
  defaults to a built-in account.
- A check that cannot run (usually a missing privilege) is shown as **could not
  run** with Snowflake's error. It is never counted as zero findings.
- If the table inventory cannot be read, the audit fails with the error. There
  is no score when nothing was analysed or a required check failed.
- Sample data (the public jaffle-shop project) appears only after you choose
  **Demo** in `/setup`, always under a DEMO banner, and is never used as a
  fallback for a failed query.
- Database, schema and warehouse names must be unquoted Snowflake identifiers
  (letters, digits, `_`, `$`). Anything else is rejected before any SQL is built.

## Connect to a Snowflake account

Credentials are resolved in this order (see `lib/snowflake.ts`):

1. Snowflake container token (when running inside Snowflake).
2. `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD` (optional
   `SNOWFLAKE_ROLE`, `SNOWFLAKE_WAREHOUSE`).
3. A Snowflake CLI connection in `~/.snowflake/connections.toml` or
   `config.toml` (`SNOWFLAKE_CONNECTION_NAME` picks one; `SNOWFLAKE_HOME`
   moves the directory).

Use a role that can read `INFORMATION_SCHEMA` on the target database. The two
query checks additionally need `ACCOUNT_USAGE` (for example via
`IMPORTED PRIVILEGES ON DATABASE SNOWFLAKE`); without it they report "could not
run" and the rest of the audit still works.

## Run it

```bash
npm ci
npm run dev          # http://localhost:3000
npm test             # vitest
npx tsc --noEmit     # type check (the build also type-checks)
npm run build
```

Docker (any host):

```bash
docker build -t dbt-model-auditor .
docker run -p 3001:3001 -e SNOWFLAKE_ACCOUNT=... -e SNOWFLAKE_USER=... -e SNOWFLAKE_PASSWORD=... dbt-model-auditor
```

Snowflake app: `snowflake.yml` (entity type `snowflake-app`) plus `app.yml`
(install, build, run). Every account-specific value is read from the
environment: set `APP_DATABASE`, `APP_SCHEMA`, `APP_WAREHOUSE` and
`APP_CODE_WORKSPACE` before running the Snowflake CLI. The deploy command itself
has not been exercised from this repository; verify it against your Snowflake
CLI version.

## Data handling

- Queries read metadata only (`INFORMATION_SCHEMA`, `ACCOUNT_USAGE`, `SHOW`).
  No query reads rows from business tables.
- The app sends nothing to third parties, except when you enable the optional
  GitHub integration (it calls `api.github.com` for the repository you name) or
  run the Cortex LLM analysis (it runs inside your Snowflake account).
- The configured target is stored in the browser's `localStorage` only.

## Portability check

From the repository root, `bash scripts/dbt-auditor-check.sh` runs the type
check, tests and build, scans the app for client names and personal account
identifiers, and starts the built app with no credentials to prove that no
endpoint returns a result it did not read.

CI runs the same script on every pull request that touches the app, the script,
`bricks/snowflake-account-audit/terms.txt` or `registry/pipeline.yaml`
(`.github/workflows/dbt-auditor.yml`).
