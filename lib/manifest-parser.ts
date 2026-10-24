/**
 * Lightweight dbt manifest.json parser and rule evaluator.
 * A small subset of dbt-project-evaluator style checks (test/doc coverage, naming,
 * direct source references), computed from manifest.json with no dbt runtime.
 */

export interface DbtManifestNode {
  unique_id: string
  name: string
  resource_type: "model" | "test" | "source" | "seed" | "snapshot" | "analysis"
  schema?: string
  database?: string
  /** The relation name dbt builds (defaults to `name`). */
  alias?: string
  config?: { materialized?: string }
  description?: string
  depends_on?: {
    // Real dbt manifests list model AND source dependencies here;
    // source ids look like source.<package>.<source_name>.<table_name>.
    nodes?: string[]
    macros?: string[]
  }
  columns?: Record<string, { name: string; description?: string }>
  /** Test nodes only: the model the generic test is attached to. */
  attached_node?: string | null
  /** Test nodes only: generic test name (unique, not_null, ...) and its kwargs. */
  test_metadata?: { name: string; kwargs?: { column_name?: string | null; [k: string]: unknown } }
}

export interface DbtFreshnessThreshold {
  count: number | null
  period: string | null
}

export interface DbtManifestSource {
  unique_id: string
  name: string
  source_name: string
  identifier?: string | null
  freshness?: { warn_after?: DbtFreshnessThreshold | null; error_after?: DbtFreshnessThreshold | null } | null
}

/** A dbt exposure: a downstream consumer (dashboard, notebook, app) of models. */
export interface DbtManifestExposure {
  unique_id: string
  name: string
  label?: string | null
  type?: string
  description?: string
  depends_on?: { nodes?: string[] }
}

export interface DbtManifest {
  nodes: Record<string, DbtManifestNode>
  sources?: Record<string, DbtManifestSource>
  exposures?: Record<string, DbtManifestExposure>
}

export interface ManifestAuditSummary {
  totalModels: number
  testedModels: number
  documentedModels: number
  testCoveragePct: number
  docCoveragePct: number
  directSourceViolations: Array<{ model: string; source: string }>
  namingViolations: Array<{ model: string; reason: string }>
}

const DBT_PREFIXES = ["stg_", "int_", "fct_", "dim_", "rpt_", "snap_", "base_", "v_", "agg_"]

export function auditDbtManifest(manifest: DbtManifest): ManifestAuditSummary {
  const models = Object.values(manifest.nodes || {}).filter((n) => n.resource_type === "model")
  const tests = Object.values(manifest.nodes || {}).filter((n) => n.resource_type === "test")

  // Map of model unique_id -> list of attached test unique_ids
  const modelTests = new Set<string>()
  for (const test of tests) {
    for (const dep of test.depends_on?.nodes || []) {
      if (dep.startsWith("model.")) {
        modelTests.add(dep)
      }
    }
  }

  let documentedCount = 0
  const namingViolations: Array<{ model: string; reason: string }> = []
  const directSourceViolations: Array<{ model: string; source: string }> = []

  for (const model of models) {
    // Documentation check
    if (model.description && model.description.trim().length > 0) {
      documentedCount++
    }

    // Naming convention check (stg_, int_, fct_, dim_, rpt_, snap_, base_, v_, agg_)
    const lowerName = model.name.toLowerCase()
    const hasValidPrefix = DBT_PREFIXES.some((prefix) => lowerName.startsWith(prefix))
    if (!hasValidPrefix) {
      namingViolations.push({
        model: model.name,
        reason: `Model does not start with standard dbt prefix (${DBT_PREFIXES.join(", ")})`,
      })
    }

    // Direct source join rule: Non-staging models should NOT depend directly on sources
    const isStaging = lowerName.startsWith("stg_") || lowerName.startsWith("base_")
    if (!isStaging) {
      for (const dep of model.depends_on?.nodes ?? []) {
        if (!dep.startsWith("source.")) continue
        const src = manifest.sources?.[dep]
        const [, , sourceName, tableName] = dep.split(".")
        directSourceViolations.push({
          model: model.name,
          source: src ? `${src.source_name}.${src.name}` : `${sourceName}.${tableName}`,
        })
      }
    }
  }

  const totalModels = models.length
  const testedCount = models.filter((m) => modelTests.has(m.unique_id)).length

  return {
    totalModels,
    testedModels: testedCount,
    documentedModels: documentedCount,
    testCoveragePct: totalModels > 0 ? Math.round((testedCount / totalModels) * 100) : 0,
    docCoveragePct: totalModels > 0 ? Math.round((documentedCount / totalModels) * 100) : 0,
    directSourceViolations,
    namingViolations,
  }
}
