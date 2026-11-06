#!/usr/bin/env node
// shared-columns-gate.mjs -- one command that fails while a manifest has shared-column
// groups not confirmed in meta, and passes once every group is confirmed (or there is none).
//
//   npm run check:shared-columns -- path/to/manifest.json
//
// Reads lib/column-semantics.ts directly through Node's native TypeScript type stripping
// (Node >= 22.18, no dependency), so the gate cannot drift from the library. It reads a raw
// dbt manifest.json or a recorded snapshot that wraps one under "manifest". Nothing is
// written or sent anywhere. Exit codes: 0 passed, 1 failed (pending groups), 2 usage error.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const [major, minor] = process.versions.node.split(".").map(Number)
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`shared-columns-gate: needs Node >= 22.18 (native TypeScript loading); running ${process.versions.node}.`)
  process.exit(2)
}

const file = process.argv[2]
if (!file) {
  console.error("usage: npm run check:shared-columns -- path/to/manifest.json")
  process.exit(2)
}

let manifest
try {
  const json = JSON.parse(readFileSync(resolve(file), "utf8"))
  manifest = json.manifest?.nodes ? json.manifest : json
  if (!manifest?.nodes) throw new Error('expected { nodes: ... } (a dbt manifest.json or a snapshot with a "manifest" key)')
} catch (e) {
  console.error(`shared-columns-gate: cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(2)
}

const { SHARED_MEANING_META_KEY, sharedColumnGroups, sharedColumnCoveragePct } = await import("../lib/column-semantics.ts")

const groups = sharedColumnGroups(manifest)
const pending = groups.filter((g) => !g.confirmed)
const pct = sharedColumnCoveragePct(groups)
const models = Object.values(manifest.nodes).filter((n) => n.resource_type === "model").length

console.log(`shared-columns-gate: ${models} models, ${groups.length} shared-column group(s), ${groups.length - pending.length} group(s) confirmed (coverage ${pct === null ? "n/a" : `${pct}%`})`)
for (const g of groups) {
  const members = g.models.map((m) => (g.confirmedBy.includes(m) ? `${m} (confirmed)` : m)).join(", ")
  console.log(`  ${g.confirmed ? "ok     " : "PENDING"} ${g.column}: ${members}${g.docBlock ? ` [doc block ${g.docBlock}]` : ""}`)
}

if (pending.length) {
  console.log(`FAILED: ${pending.length} group(s) not confirmed. Confirm with the owners, then set meta.${SHARED_MEANING_META_KEY}: true on every listed column. Same name and text are not assumed to mean the same thing.`)
  process.exit(1)
}
console.log(groups.length ? "PASSED: every shared-column group is confirmed in meta." : "PASSED: no column shares a name and a description across models.")
