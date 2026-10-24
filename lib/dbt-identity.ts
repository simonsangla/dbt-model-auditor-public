/**
 * Which Snowflake objects are dbt models?
 *
 * Snowflake metadata carries no dbt identity, so without a manifest the audit
 * treats every table and view in the schema as a model. With a manifest, each
 * model node names the relation it builds (`database`, `schema`, `alias`; see
 * `relation_name`), which is the join key used here.
 *
 * Client-safe: no server imports.
 */

import type { AuditConfig } from "./config"
import type { AuditFinding, AuditResult, ModelInfo } from "./audit-engine"
import { computeScore } from "./audit-engine"
import type { DbtManifest, DbtManifestNode } from "./manifest-parser"

export interface DbtScope {
  /** Snowflake objects a manifest model builds. */
  dbtModels: ModelInfo[]
  /** Snowflake objects in the schema that no manifest model builds. */
  notInManifest: ModelInfo[]
  /** Manifest models targeting this schema with no table or view in Snowflake. */
  missingInSnowflake: DbtManifestNode[]
  /** How many manifest models build a relation in the audited schema. 0 = wrong manifest or target. */
  targetedCount: number
}

const upper = (v: string | undefined | null) => (v ?? "").toUpperCase()

/** The relation a model builds, or null for ephemeral models (they build none). */
function relationOf(node: DbtManifestNode): { database: string; schema: string; name: string } | null {
  if (node.resource_type !== "model") return null
  if (node.config?.materialized === "ephemeral") return null
  return { database: upper(node.database), schema: upper(node.schema), name: upper(node.alias || node.name) }
}

export function matchInventoryToManifest(
  models: ModelInfo[],
  manifest: DbtManifest,
  config: Pick<AuditConfig, "database" | "schema">,
): DbtScope {
  const db = upper(config.database)
  const schema = upper(config.schema)

  // Model nodes that build a relation in the audited database and schema,
  // keyed by upper-cased relation name.
  const targeted = new Map<string, DbtManifestNode>()
  for (const node of Object.values(manifest.nodes || {})) {
    const rel = relationOf(node)
    if (rel && rel.database === db && rel.schema === schema) targeted.set(rel.name, node)
  }

  const dbtModels: ModelInfo[] = []
  const notInManifest: ModelInfo[] = []
  const found = new Set<string>()
  for (const m of models) {
    const key = upper(m.name)
    if (targeted.has(key)) {
      dbtModels.push(m)
      found.add(key)
    } else {
      notInManifest.push(m)
    }
  }
  const missingInSnowflake = [...targeted.entries()].filter(([key]) => !found.has(key)).map(([, node]) => node)

  return { dbtModels, notInManifest, missingInSnowflake, targetedCount: targeted.size }
}

/**
 * Re-scopes an audit result to dbt models only: findings on objects no model
 * builds are dropped, schema-level findings (no `model`) are kept, and each
 * manifest model missing in Snowflake becomes a warning. The score is
 * recomputed over dbt models with the same formula, and stays null when the
 * original run could not be scored.
 */
export function scopeAuditToDbt(result: AuditResult, scope: DbtScope): AuditResult {
  const dbtNames = new Set(scope.dbtModels.map((m) => upper(m.name)))
  const notBuilt: AuditFinding[] = scope.missingInSnowflake.map((node) => ({
    rule: "dbt-model-not-built",
    severity: "warning",
    category: "dbt Architecture",
    message: `dbt model "${node.name}" has no table or view in Snowflake`,
    model: node.alias || node.name,
    detail: "The manifest builds this model into the audited schema, but Snowflake has no such object. It was never built, failed to build, or was built elsewhere.",
    fixSnippet: `dbt build --select ${node.name}`,
  }))
  const findings = [
    ...result.findings.filter((f) => !f.model || dbtNames.has(upper(f.model))),
    ...notBuilt,
  ]
  const totalModels = scope.dbtModels.length
  return {
    ...result,
    findings,
    models: scope.dbtModels,
    totalModels,
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    infos: findings.filter((f) => f.severity === "info").length,
    score: result.score === null ? null : computeScore(findings, totalModels),
  }
}
