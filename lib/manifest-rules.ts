// Manifest structure rules, computed from manifest.json alone (no dbt runtime).
// Rule definitions adapted from dbt-labs/dbt-project-evaluator, Apache License 2.0
// (see NOTICE). Thresholds follow the evaluator defaults; the code is our own.
//
// The wedge: joinRuntimeEvidence() and the freshness rule combine a manifest rule with
// the Snowflake runtime evidence already collected by audit-engine.ts (LAST_ALTERED,
// SHOW PRIMARY KEYS), which a manifest-only linter cannot see.
import type { AuditFinding, ModelInfo } from "./audit-engine"
import type { DbtFreshnessThreshold, DbtManifest, DbtManifestNode } from "./manifest-parser"

/** dbt-project-evaluator default: models_fanout_threshold = 3. */
export const FANOUT_THRESHOLD = 3

function modelsOf(m: DbtManifest): DbtManifestNode[] {
  return Object.values(m.nodes ?? {}).filter((n) => n.resource_type === "model")
}

function deps(n: DbtManifestNode): string[] {
  return n.depends_on?.nodes ?? []
}

function isStaging(name: string): boolean {
  const l = name.toLowerCase()
  return l.startsWith("stg_") || l.startsWith("base_")
}

/** Human-readable evidence for the missing unique + not_null pair. */
export function pkEvidence(unique: string[], notNull: string[]): string {
  if (unique.length === 0 && notNull.length === 0) return "Evidence: no unique or not_null test on any column."
  const parts: string[] = []
  if (unique.length) parts.push(`unique on ${unique.join(", ")}`)
  if (notNull.length) parts.push(`not_null on ${notNull.join(", ")}`)
  const noNotNull = unique.filter((c) => !notNull.includes(c))
  const noUnique = notNull.filter((c) => !unique.includes(c))
  const gaps: string[] = []
  if (noNotNull.length) gaps.push(`${noNotNull.join(", ")} lack${noNotNull.length === 1 ? "s" : ""} not_null`)
  if (noUnique.length) gaps.push(`${noUnique.join(", ")} lack${noUnique.length === 1 ? "s" : ""} unique`)
  return `Evidence: ${parts.join("; ")}.${gaps.length ? ` Missing the pair: ${gaps.join("; ")}.` : ""}`
}

/** Case-insensitive match of a dbt source to the warehouse table of the same identifier (or name). */
export function matchSourceLastAltered(s: { name: string; identifier?: string | null }, models: ModelInfo[]): string | undefined {
  const keys = new Set([s.identifier, s.name].filter((k): k is string => !!k).map((k) => k.toLowerCase()))
  return models.find((x) => keys.has(x.name.toLowerCase()) && !!x.lastAltered)?.lastAltered ?? undefined
}

export function ruleMissingPkTests(m: DbtManifest): AuditFinding[] {
  const unique = new Map<string, Set<string>>()
  const notNull = new Map<string, Set<string>>()
  for (const t of Object.values(m.nodes ?? {})) {
    if (t.resource_type !== "test" || !t.test_metadata) continue
    const col = t.test_metadata.kwargs?.column_name
    const target = t.attached_node ?? deps(t).find((d) => d.startsWith("model."))
    if (!col || !target) continue
    const bucket = t.test_metadata.name === "unique" ? unique : t.test_metadata.name === "not_null" ? notNull : null
    if (!bucket) continue
    if (!bucket.has(target)) bucket.set(target, new Set())
    bucket.get(target)!.add(String(col).toLowerCase())
  }
  return modelsOf(m)
    .filter((n) => {
      const u = unique.get(n.unique_id)
      const nn = notNull.get(n.unique_id)
      return !u || !nn || ![...u].some((c) => nn.has(c))
    })
    .map((n) => ({
      rule: "missing-pk-tests",
      severity: "warning" as const,
      category: "Data Integrity" as const,
      model: n.name,
      message: `Model "${n.name}" has no unique + not_null test pair on any column`,
      detail: pkEvidence([...(unique.get(n.unique_id) ?? [])], [...(notNull.get(n.unique_id) ?? [])]),
      fixSnippet: `columns:\n  - name: <key_column>\n    data_tests:\n      - unique\n      - not_null`,
    }))
}

function declared(t?: DbtFreshnessThreshold | null): boolean {
  return !!t && t.count !== null && t.count !== undefined && !!t.period
}

export function ruleSourceFreshnessMissing(m: DbtManifest, models: ModelInfo[] = []): AuditFinding[] {
  return Object.values(m.sources ?? {})
    .filter((s) => !declared(s.freshness?.warn_after) && !declared(s.freshness?.error_after))
    .map((s) => {
      const last = matchSourceLastAltered(s, models)
      const actual = last ? `actual LAST_ALTERED ${last}` : "actual: not queried (manifest-only sample)"
      return {
        rule: "source-freshness-missing",
        severity: "warning" as const,
        category: "Data Integrity" as const,
        model: `source:${s.name}`,
        message: `Source ${s.source_name}.${s.name}: freshness none declared; ${actual}`,
        detail: `Evidence: no warn_after or error_after count in the manifest for ${s.unique_id}.`,
        fixSnippet: `sources:\n  - name: ${s.source_name}\n    loaded_at_field: <timestamp_column>\n    freshness:\n      warn_after: {count: 24, period: hour}\n      error_after: {count: 48, period: hour}`,
      }
    })
}

export function ruleFanOut(m: DbtManifest): AuditFinding[] {
  const children = new Map<string, string[]>()
  for (const n of modelsOf(m)) {
    for (const d of deps(n)) {
      if (!d.startsWith("model.")) continue
      if (!children.has(d)) children.set(d, [])
      children.get(d)!.push(n.name)
    }
  }
  return modelsOf(m)
    .filter((n) => (children.get(n.unique_id)?.length ?? 0) > FANOUT_THRESHOLD)
    .map((n) => {
      const kids = children.get(n.unique_id)!
      return {
        rule: "fan-out",
        severity: "warning" as const,
        category: "dbt Architecture" as const,
        model: n.name,
        message: `Model "${n.name}" has ${kids.length} direct children (threshold ${FANOUT_THRESHOLD})`,
        detail: `Evidence: children ${kids.join(", ")}.`,
        fixSnippet: `-- Move shared logic into one downstream intermediate model and point the children at it.`,
      }
    })
}

export function ruleRootModel(m: DbtManifest): AuditFinding[] {
  return modelsOf(m)
    .filter((n) => deps(n).length === 0)
    .map((n) => ({
      rule: "root-model",
      severity: "warning" as const,
      category: "dbt Architecture" as const,
      model: n.name,
      message: `Model "${n.name}" has no ref() or source() dependency`,
      detail: "Evidence: depends_on.nodes is empty, so the table name is hard-coded.",
      fixSnippet: `select * from {{ source('<source_name>', '<table>') }}`,
    }))
}

export function ruleMultipleSourcesJoined(m: DbtManifest): AuditFinding[] {
  return modelsOf(m)
    .map((n) => ({ n, srcs: deps(n).filter((d) => d.startsWith("source.")) }))
    .filter(({ srcs }) => srcs.length >= 2)
    .map(({ n, srcs }) => ({
      rule: "multiple-sources-joined",
      severity: "warning" as const,
      category: "dbt Architecture" as const,
      model: n.name,
      message: `Model "${n.name}" joins ${srcs.length} sources directly`,
      detail: `Evidence: ${srcs.join(", ")}.`,
      fixSnippet: `-- Give each source its own stg_ model, then join the staging models.`,
    }))
}

export function ruleStagingDependsOnStaging(m: DbtManifest): AuditFinding[] {
  const byId = new Map(modelsOf(m).map((n) => [n.unique_id, n]))
  return modelsOf(m)
    .filter((n) => isStaging(n.name))
    .map((n) => ({ n, parents: deps(n).map((d) => byId.get(d)).filter((p): p is DbtManifestNode => !!p && isStaging(p.name)) }))
    .filter(({ parents }) => parents.length > 0)
    .map(({ n, parents }) => ({
      rule: "staging-depends-on-staging",
      severity: "warning" as const,
      category: "dbt Architecture" as const,
      model: n.name,
      message: `Staging model "${n.name}" depends on staging model ${parents.map((p) => p.name).join(", ")}`,
      detail: "Evidence: staging models should read one source each; logic built on staging belongs in int_.",
      fixSnippet: `-- Rename to int_${n.name.replace(/^(stg_|base_)/, "")} or read the source directly.`,
    }))
}

export function runManifestRules(m: DbtManifest, models: ModelInfo[] = []): AuditFinding[] {
  return [
    ...ruleMissingPkTests(m),
    ...ruleSourceFreshnessMissing(m, models),
    ...ruleFanOut(m),
    ...ruleRootModel(m),
    ...ruleMultipleSourcesJoined(m),
    ...ruleStagingDependsOnStaging(m),
  ]
}

/**
 * PK wedge: when the manifest has no unique+not_null pair AND Snowflake reports no
 * declared primary key on the same table, emit one combined finding instead of two.
 */
export function joinRuntimeEvidence(manifestFindings: AuditFinding[], runtimeFindings: AuditFinding[]): AuditFinding[] {
  const noPk = new Map(
    runtimeFindings.filter((f) => f.rule === "no-primary-key" && f.model).map((f) => [f.model!.toLowerCase(), f]),
  )
  const merged = new Set<string>()
  const out: AuditFinding[] = []
  for (const f of manifestFindings) {
    const key = f.model?.toLowerCase()
    if (f.rule === "missing-pk-tests" && key && noPk.has(key)) {
      merged.add(key)
      out.push({
        ...f,
        rule: "pk-untested-undeclared",
        message: `Model "${f.model}": no PK test and no declared PK`,
        detail: `${f.detail ?? ""} Snowflake SHOW PRIMARY KEYS returns none for this table.`.trim(),
      })
    } else out.push(f)
  }
  for (const f of runtimeFindings) {
    if (f.rule === "no-primary-key" && f.model && merged.has(f.model.toLowerCase())) continue
    out.push(f)
  }
  return out
}
