# Recorded demo data: how to rebuild it

The two bundled demos are recordings of real runs on the public dbt project
[dbt-labs/jaffle-shop-classic](https://github.com/dbt-labs/jaffle-shop-classic)
at commit `fd7bfac`, built in a Snowflake account the operator owns. Viewing the
demos runs no query; this page is only for re-recording them.

## What is added to jaffle-shop

- `models/seeded_defects/`: defects added **on purpose** so the demos show findings,
  and named on screen as seeded:
  - `stg_refunds`: a staging table whose filter matches nothing (0 rows).
  - `customer_ltv`: a mart with no tests or docs that reads a raw source directly.
- `models/trust/trust_orders.sql`: the one-row-per-order view the Trust Sprint
  question pack queries.

## Steps

1. Clone jaffle-shop-classic at `fd7bfac`, copy `models/` from this folder into its
   `models/`, point a dbt profile at your own database and schema, and run `dbt build`.
2. Auditor demo: `node scripts/record-audit-snapshot.mjs --connection <snow connection>
   --database <DB> --schema <SCHEMA> --warehouse <WH> --manifest <jaffle>/target/manifest.json
   --repo dbt-labs/jaffle-shop-classic --commit fd7bfac --seeded "<model>: <defect>; ..."
   --rename "<YOUR_DB>=JAFFLE_DB,<YOUR_WH>=DEMO_WH"`
   writes `lib/audit-snapshot.json`.
3. Trust Sprint demo: from `scripts/trust-jaffle/`, run the Trust Sprint toolkit's
   `validation_harness.py` (its own `.venv`) with `--snowflake-config` naming your
   connection (`connection_name`), `--semantic-view <SCHEMA>.TRUST_ORDERS` (the connection's database, so no account name lands in the fixture),
   a `--source` that names the seeded defects, and `--json trust-sample.json`;
   copy the file to `lib/trust-sample.json`. Never edit either fixture by hand.

Only record a schema whose model names and row counts may be published.
