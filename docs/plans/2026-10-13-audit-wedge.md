# Audit wedge: manifest rules joined to Snowflake evidence

Goal: make the dbt audit demo show what free linters (dbt-project-evaluator, dbt-bouncer)
cannot: a manifest rule backed by Snowflake runtime evidence, visible on the lineage graph.
Owner decision 2026-10-13 (Simon, picker "Wedge: manifest x Snowflake").

## Scope
1. Manifest rules (pure TS, lib/manifest-rules.ts), thresholds ported from
   dbt-project-evaluator (Apache-2.0; attribution in NOTICE):
   - missing-pk-tests: model without unique + not_null data tests on the same column
     (test nodes: test_metadata.name, attached_node, column_name).
   - source-freshness-missing: source without freshness.warn_after / error_after.
   - fan-out: model with > 3 direct children (child_map).
   - root-model: model whose depends_on.nodes is empty.
   - multiple-sources-joined: model depending on >= 2 sources.
   - staging-depends-on-staging: staging model depending on another staging model.
   Each finding: severity, message, evidence, fix hint text.
2. Runtime join (the wedge):
   - freshness: declared (source freshness, or none) vs actual LAST_ALTERED from the
     models/tables data already queried; message states both.
   - PK: when missing-pk-tests and the runtime no-primary-key both fire on a model, one
     combined finding "no PK test and no declared PK". A live duplicate-count query is
     OUT of scope for this slice (needs live Snowflake; listed as follow-up).
3. Graph: edges leaving a node with error/warning findings are drawn red and the detail
   panel shows "N issues propagate to M downstream models".
4. Samples: revenue-variance sample and jaffle snapshot both run the new rules; counts
   updated in tests; the revenue sample shows at least 3 new findings.

## Out of scope
Live Snowflake duplicate query, CI/SARIF mode, React Flow, column lineage.

## Verification
tsc, full vitest (new unit tests per rule with positive + negative fixture),
scripts/dbt-auditor-check.sh, Playwright on /lineage?sample=revenue and ?sample=jaffle
(counts, red edges, console errors, screenshots).
