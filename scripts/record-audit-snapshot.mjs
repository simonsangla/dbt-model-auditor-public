#!/usr/bin/env node
// Records ONE real audit run so the demo can replay it without querying Snowflake.
//
// It runs the app's own audit engine (lib/audit-engine.ts) against a real schema,
// sending every query through the Snowflake CLI on a named connection, and saves
// each query's rows plus a trimmed dbt manifest to lib/audit-snapshot.json.
// lib/audit-snapshot.ts replays those rows through the CURRENT engine on every view.
//
// Only record a schema whose model names and row counts may be published: the
// snapshot ships in the public demo. Re-run this after changing a rule's SQL.
//
// usage:
//   node scripts/record-audit-snapshot.mjs --connection <snow conn> --database <DB> \
//     --schema <SCHEMA> --warehouse <WH> --manifest <dbt target/manifest.json> \
//     --repo <owner/name> --commit <sha> [--seeded "model: defect; model: defect"]
//     [--rename "OLD_DB=NEW_DB,OLD_WH=NEW_WH"]
//
// --rename replaces account-specific names (database, warehouse) everywhere in the
// saved snapshot, so the published demo does not name the recording account.
//
// --seeded names every defect added on purpose to the recorded project, so the
// demo can label it; leave it out for an untouched project.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { createServer } from "vite"

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, v, i, all) => (v.startsWith("--") ? [...pairs, [v.slice(2), all[i + 1]]] : pairs), []),
)
for (const k of ["connection", "database", "schema", "warehouse", "manifest", "repo", "commit"]) {
  if (!args[k]) throw new Error(`missing --${k}`)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const vite = await createServer({ root, logLevel: "error", appType: "custom", server: { middlewareMode: true }, resolve: { alias: { "@": root } } })
const { runAudit, CORE_RULES } = await vite.ssrLoadModule("/lib/audit-engine.ts")

const queries = []
async function query(sql) {
  const out = execFileSync(
    "snow",
    ["sql", "-c", args.connection, "--warehouse", args.warehouse, "--format", "json", "-q", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  )
  const rows = JSON.parse(out)
  queries.push({ sql, rows })
  return rows
}

const config = { warehouse: args.warehouse, database: args.database, schema: args.schema, githubRepo: args.repo }
const result = await runAudit(query, config, CORE_RULES)
await vite.close()

// Keep only the manifest fields lib/manifest-parser.ts reads; the full file carries every macro.
const full = JSON.parse(readFileSync(args.manifest, "utf8"))
const keep = ["unique_id", "name", "resource_type", "schema", "database", "alias", "description", "depends_on", "attached_node", "test_metadata", "columns"]
const nodes = Object.fromEntries(
  Object.entries(full.nodes)
    .filter(([, n]) => ["model", "test", "seed", "snapshot"].includes(n.resource_type))
    .map(([id, n]) => {
      const t = Object.fromEntries(keep.filter((k) => n[k] !== undefined).map((k) => [k, n[k]]))
      if (t.depends_on) t.depends_on = { nodes: t.depends_on.nodes ?? [] }
      if (t.columns) t.columns = Object.fromEntries(Object.entries(t.columns).map(([c, v]) => [c, { name: v.name, description: v.description }]))
      if (n.config?.materialized) t.config = { materialized: n.config.materialized }
      return [id, t]
    }),
)
const sources = Object.fromEntries(
  Object.entries(full.sources ?? {}).map(([id, s]) => [id, { unique_id: s.unique_id, name: s.name, source_name: s.source_name }]),
)

const snapshot = {
  note: "Recorded real audit run, replayed by lib/audit-snapshot.ts. Regenerate with scripts/record-audit-snapshot.mjs; never edit by hand.",
  recordedAt: result.runAt,
  source: { project: args.repo, commit: args.commit, database: args.database, schema: args.schema, dbtVersion: full.metadata?.dbt_version, seeded: args.seeded ? args.seeded.split(";").map((s) => s.trim()) : [] },
  config,
  expected: { totalModels: result.totalModels, errors: result.errors, warnings: result.warnings, infos: result.infos, score: result.score, checks: result.checks.map((c) => `${c.rule}:${c.status}`) },
  queries,
  manifest: { nodes, sources },
}
const renames = (args.rename ?? "").split(",").filter(Boolean).map((pair) => pair.split("="))
let text = JSON.stringify({ ...snapshot, renamed: renames.length > 0 }, null, 1)
for (const [from, to] of renames) text = text.split(from).join(to)
const out = path.join(root, "lib/audit-snapshot.json")
writeFileSync(out, text + "\n")
console.log(JSON.stringify({ out, queries: queries.length, ...snapshot.expected }))
