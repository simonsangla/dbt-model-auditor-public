// Replays the recorded real audit run (lib/audit-snapshot.json) through the CURRENT
// audit engine. The demo therefore shows real output and never queries Snowflake.
// Record or refresh the snapshot with scripts/record-audit-snapshot.mjs.
import snapshotJson from "./audit-snapshot.json"
import { runAudit, CORE_RULES, type AuditResult } from "./audit-engine"
import type { AuditConfig } from "./config"
import type { DbtManifest } from "./manifest-parser"

interface AuditSnapshot {
  recordedAt: string
  source: { project: string; commit: string; database: string; schema: string; dbtVersion?: string; seeded: string[] }
  /** true when the recorder replaced account-specific database and warehouse names. */
  renamed?: boolean
  config: AuditConfig
  expected: { totalModels: number; errors: number; warnings: number; infos: number; score: number | null; checks: string[] }
  queries: { sql: string; rows: Record<string, unknown>[] }[]
  manifest: DbtManifest
}

const snapshot = snapshotJson as unknown as AuditSnapshot

export const SNAPSHOT_CONFIG: AuditConfig = { ...snapshot.config, demo: true }
export const SNAPSHOT_MANIFEST: DbtManifest = snapshot.manifest
export const SNAPSHOT_SOURCE = { ...snapshot.source, recordedAt: snapshot.recordedAt, renamed: snapshot.renamed === true }
export const SNAPSHOT_EXPECTED = snapshot.expected

/** Answers a query from the recording; a query the recording never saw is an error, not an empty result. */
export async function snapshotQuery(sql: string): Promise<Record<string, unknown>[]> {
  const hit = snapshot.queries.find((q) => q.sql === sql)
  if (!hit) throw new Error("This query is not in the recorded snapshot. Re-record with scripts/record-audit-snapshot.mjs.")
  return hit.rows
}

export async function replaySnapshot(): Promise<AuditResult> {
  const result = await runAudit(snapshotQuery, SNAPSHOT_CONFIG, CORE_RULES)
  return { ...result, runAt: snapshot.recordedAt }
}
