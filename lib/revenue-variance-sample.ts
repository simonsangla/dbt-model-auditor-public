// Second sample: the real manifest of the public dbt-revenue-variance-demo (dbt-duckdb).
// Manifest-only: the Snowflake rules in audit-engine.ts cannot run on DuckDB, so the
// findings here come from the manifest heuristics in manifest-parser.ts alone.
import sampleJson from "./revenue-variance-sample.json"
import type { AuditFinding } from "./audit-engine"
import { auditDbtManifest, type DbtManifest } from "./manifest-parser"
import { runManifestRules } from "./manifest-rules"

interface ManifestSample {
  source: { project: string; commit: string; adapter: string; dbtVersion?: string; parsedAt: string }
  manifest: DbtManifest
}

const sample = sampleJson as unknown as ManifestSample

export const REVENUE_VARIANCE_SOURCE = sample.source
export const REVENUE_VARIANCE_MANIFEST: DbtManifest = sample.manifest

/** Turns the manifest heuristics into per-model findings the lineage map can attach. */
export function manifestFindings(manifest: DbtManifest): AuditFinding[] {
  const summary = auditDbtManifest(manifest)
  const models = Object.values(manifest.nodes).filter((n) => n.resource_type === "model")
  const tested = new Set(
    Object.values(manifest.nodes)
      .filter((n) => n.resource_type === "test")
      .flatMap((t) => t.depends_on?.nodes ?? []),
  )
  const findings: AuditFinding[] = []
  for (const m of models) {
    if (!tested.has(m.unique_id)) {
      findings.push({ rule: "untested-model", severity: "warning", model: m.name, message: "Model has no dbt tests", category: "Data Integrity" })
    }
    if (!m.description?.trim()) {
      findings.push({ rule: "undocumented-model", severity: "info", model: m.name, message: "Model has no description", category: "Governance" })
    }
  }
  for (const v of summary.namingViolations) {
    findings.push({ rule: "naming", severity: "info", model: v.model, message: v.reason, category: "dbt Architecture" })
  }
  for (const v of summary.directSourceViolations) {
    findings.push({ rule: "direct-source-join", severity: "warning", model: v.model, message: `Reads source ${v.source} directly`, category: "dbt Architecture" })
  }
  return findings
}

export const REVENUE_VARIANCE_FINDINGS = manifestFindings(REVENUE_VARIANCE_MANIFEST)

/** Structure rules (lib/manifest-rules.ts). Manifest-only: no runtime evidence on DuckDB. */
export const REVENUE_VARIANCE_RULE_FINDINGS = runManifestRules(REVENUE_VARIANCE_MANIFEST)
