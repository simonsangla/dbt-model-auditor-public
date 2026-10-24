/**
 * Reusable audit engine for Snowflake dbt model auditing and bug finding.
 *
 * Rules are plain objects: each carries a parametrized SQL template and a
 * mapper that turns raw Snowflake rows into AuditFinding[]. The runner
 * executes all rules concurrently and aggregates results.
 *
 * Designed to be portable — depends only on the AuditConfig shape and a
 * generic queryFn, not on any specific Snowflake SDK or framework.
 */

import { isIdentifier, type AuditConfig } from "./config"

export type Severity = "error" | "warning" | "info"

export interface AuditFinding {
  rule: string
  severity: Severity
  message: string
  model?: string
  detail?: string
  fixSnippet?: string
  category?: "Data Integrity" | "Snowflake Cost" | "dbt Architecture" | "Governance"
}

export interface ModelInfo {
  name: string
  database: string
  schema: string
  kind: string
  /** null for a view: Snowflake stores no row count for it (not zero rows). */
  rows: number | null
  bytes: number
  createdOn: string
  lastAltered: string
  clusterBy: string | null
}

export interface CheckStatus {
  rule: string
  name: string
  status: "ok" | "failed"
  /** Why the check could not run (usually a missing privilege). Never counted as a finding. */
  error?: string
}

export interface AuditResult {
  totalModels: number
  errors: number
  warnings: number
  infos: number
  /** null when there is nothing to score or a required check failed. */
  score: number | null
  checks: CheckStatus[]
  findings: AuditFinding[]
  models: ModelInfo[]
  config: AuditConfig
  runAt: string
}

export interface AuditRule {
  id: string
  name: string
  severity: Severity
  description: string
  category?: "Data Integrity" | "Snowflake Cost" | "dbt Architecture" | "Governance"
  sql: (config: AuditConfig) => string
  /** `models` is the schema inventory, read before any rule runs. */
  mapFindings: (rows: Record<string, unknown>[], config: AuditConfig, models: ModelInfo[]) => AuditFinding[]
  optional?: boolean
}

type QueryFn = (sql: string, opts?: { warehouse?: string }) => Promise<Record<string, unknown>[]>

function toIso(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString()
  return String(val)
}

export function computeScore(findings: AuditFinding[], totalModels: number): number | null {
  if (totalModels === 0) return null
  const errors = findings.filter((f) => f.severity === "error").length
  const warnings = findings.filter((f) => f.severity === "warning").length
  const penalty = (errors * 10 + warnings * 3) / totalModels
  return Math.max(0, Math.round(100 - penalty * 10))
}

// Identifiers are validated by validateConfig() before any SQL is built, so
// they contain only [A-Za-z0-9_$]. Unquoted, they resolve case-insensitively.
function id(value: string): string {
  if (!isIdentifier(value)) throw new Error(`Invalid Snowflake identifier: ${JSON.stringify(value)}`)
  return value
}

/**
 * Generate 1-click drop-in fix snippet for any audit finding
 */
export function generateFixSnippet(finding: AuditFinding): string {
  const model = finding.model || "my_model"
  switch (finding.rule) {
    case "empty-model":
    case "Empty Models":
      return `-- Run full refresh to re-populate table\ndbt run --full-refresh --select ${model}`

    case "missing-clustering":
    case "Large Unclustered Tables (>100MB)":
      return `{{ config(\n    materialized='table',\n    cluster_by=['created_at', 'id']\n) }}`

    case "direct-source-join":
    case "dbt Architecture (Direct Source Join)":
      return `-- Replace direct source() with ref() staging model\n-- BEFORE: FROM {{ source('raw_source', '${model}') }}\n-- AFTER:\nSELECT * FROM {{ ref('stg_${model}') }}`

    case "stale-model":
    case "Stale Models":
      return `-- Confirm the model is still selected by a scheduled dbt job before removing anything\ndbt ls --select ${model}`

    case "untested-model":
    case "Untested Models":
      return `version: 2\nmodels:\n  - name: ${model}\n    columns:\n      - name: id\n        tests:\n          - unique\n          - not_null`

    case "missing-description":
    case "Missing Documentation":
      return `version: 2\nmodels:\n  - name: ${model}\n    description: "Analytics-ready model representing ${model.replace(/^(stg_|int_|fct_|dim_)/, "")} entity."`

    default:
      return `-- Recommended fix for ${finding.rule}\ndbt build --select ${model}`
  }
}

// --- Built-in rules ---

export const CORE_RULES: AuditRule[] = [
  {
    id: "empty-model",
    name: "Empty Models",
    severity: "error",
    category: "Data Integrity",
    description: "Tables with 0 rows",
    sql: (c) => `
      SELECT TABLE_NAME, TABLE_CATALOG, TABLE_SCHEMA, TABLE_TYPE,
             ROW_COUNT, BYTES, CREATED, LAST_ALTERED, CLUSTERING_KEY
      FROM ${id(c.database)}.INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = UPPER('${id(c.schema)}')
        AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      ORDER BY LAST_ALTERED DESC`,
    mapFindings: (rows) =>
      rows
        .filter((r) => Number(r.ROW_COUNT ?? 0) === 0 && String(r.TABLE_TYPE ?? "") === "BASE TABLE")
        .map((r) => {
          const modelName = String(r.TABLE_NAME ?? "")
          return {
            rule: "empty-model",
            severity: "error" as Severity,
            category: "Data Integrity",
            message: `Model "${modelName}" has 0 rows`,
            model: modelName,
            detail: "Physical table in Snowflake contains 0 rows. May indicate upstream pipeline failure.",
            fixSnippet: `dbt run --full-refresh --select ${modelName}`,
          }
        }),
  },
  {
    id: "stale-model",
    name: "Stale Models",
    severity: "warning",
    category: "Snowflake Cost",
    description: "Tables not altered in 30+ days",
    sql: (c) => `
      SELECT TABLE_NAME, LAST_ALTERED
      FROM ${id(c.database)}.INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = UPPER('${id(c.schema)}')
        AND TABLE_TYPE = 'BASE TABLE'
        AND LAST_ALTERED < DATEADD('day', -30, CURRENT_TIMESTAMP())`,
    mapFindings: (rows) =>
      rows.map((r) => {
        const modelName = String(r.TABLE_NAME ?? "")
        return {
          rule: "stale-model",
          severity: "warning" as Severity,
          category: "Snowflake Cost",
          message: `Model "${modelName}" has not been altered in 30+ days`,
          model: modelName,
          detail: `Last altered: ${toIso(r.LAST_ALTERED)?.slice(0, 10) ?? "unknown"}. Either its dbt job stopped selecting it, or it is no longer used.`,
          fixSnippet: `-- Confirm the model is still selected by a scheduled dbt job before removing anything\ndbt ls --select ${modelName}`,
        }
      }),
  },
  {
    id: "missing-clustering",
    name: "Missing Clustering",
    severity: "warning",
    category: "Snowflake Cost",
    description: "Large tables (>100MB) without a clustering key",
    sql: (c) => `
      SELECT TABLE_NAME, BYTES, CLUSTERING_KEY
      FROM ${id(c.database)}.INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = UPPER('${id(c.schema)}')
        AND BYTES > 100000000
        AND (CLUSTERING_KEY IS NULL OR CLUSTERING_KEY = '')`,
    mapFindings: (rows) =>
      rows.map((r) => {
        const modelName = String(r.TABLE_NAME ?? "")
        return {
          rule: "missing-clustering",
          severity: "warning" as Severity,
          category: "Snowflake Cost",
          message: `Model "${modelName}" is >100MB without a clustering key`,
          model: modelName,
          detail: `Size: ${(Number(r.BYTES ?? 0) / 1_000_000).toFixed(1)}MB. Full micro-partition scans increase warehouse credit consumption.`,
          fixSnippet: `{{ config(\n    materialized='table',\n    cluster_by=['created_at', 'id']\n) }}`,
        }
      }),
  },
  {
    id: "recent-failure",
    name: "Recent Query Failures",
    severity: "error",
    category: "Data Integrity",
    description: "Failed queries in the target schema (last 7 days)",
    sql: (c) => `
      SELECT QUERY_TEXT, ERROR_MESSAGE, START_TIME, QUERY_ID
      FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
      WHERE EXECUTION_STATUS = 'FAIL'
        AND UPPER(DATABASE_NAME) = UPPER('${id(c.database)}')
        AND UPPER(SCHEMA_NAME) = UPPER('${id(c.schema)}')
        AND START_TIME > DATEADD('day', -7, CURRENT_TIMESTAMP())
      ORDER BY START_TIME DESC
      LIMIT 20`,
    mapFindings: (rows) =>
      rows.map((r) => ({
        rule: "recent-failure",
        severity: "error" as Severity,
        category: "Data Integrity",
        message: "Failed query in target schema",
        detail: String(r.ERROR_MESSAGE ?? "").slice(0, 200),
      })),
    optional: true,
  },
  {
    id: "slow-query",
    name: "Slow Queries",
    severity: "warning",
    category: "Snowflake Cost",
    description: "Queries taking >60s in the target schema (last 7 days)",
    sql: (c) => `
      SELECT QUERY_TEXT, TOTAL_ELAPSED_TIME, BYTES_SCANNED, START_TIME
      FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
      WHERE UPPER(DATABASE_NAME) = UPPER('${id(c.database)}')
        AND UPPER(SCHEMA_NAME) = UPPER('${id(c.schema)}')
        AND TOTAL_ELAPSED_TIME > 60000
        AND START_TIME > DATEADD('day', -7, CURRENT_TIMESTAMP())
      ORDER BY TOTAL_ELAPSED_TIME DESC
      LIMIT 10`,
    mapFindings: (rows) =>
      rows.map((r) => ({
        rule: "slow-query",
        severity: "warning" as Severity,
        category: "Snowflake Cost",
        message: `Query took ${(Number(r.TOTAL_ELAPSED_TIME ?? 0) / 1000).toFixed(0)}s`,
        detail: String(r.QUERY_TEXT ?? "").slice(0, 120),
      })),
    optional: true,
  },
  {
    // Port of bricks/snowflake-account-audit R05b. Snowflake does not enforce
    // primary keys, so this is information only and never moves the score;
    // a declared key (RELY) still documents the grain and helps join planning.
    // verified: https://docs.snowflake.com/en/sql-reference/sql/show-primary-keys -- "SHOW [ TERSE ] PRIMARY KEYS [ IN { ACCOUNT | DATABASE [ <database_name> ] | SCHEMA [ <schema_name> ] | TABLE | [ TABLE ] <table_name> } ]"
    id: "no-primary-key",
    name: "Base Tables Without a Primary Key",
    severity: "info",
    category: "Data Integrity",
    description: "Base tables with no declared primary key (Snowflake does not enforce them)",
    sql: (c) => `SHOW PRIMARY KEYS IN SCHEMA ${id(c.database)}.${id(c.schema)}`,
    mapFindings: (rows, _config, models) => {
      // SHOW output columns are lower case; unquoted table names are upper case.
      const keyed = new Set(
        rows.map((r) => String(r.table_name ?? r.TABLE_NAME ?? "").toUpperCase()).filter(Boolean),
      )
      return models
        .filter((m) => m.kind === "BASE TABLE" && !keyed.has(m.name.toUpperCase()))
        .map((m) => ({
          rule: "no-primary-key",
          severity: "info" as Severity,
          category: "Data Integrity" as const,
          message: `Base table "${m.name}" has no declared primary key`,
          model: m.name,
          detail: "Snowflake does not enforce primary keys; declaring one (RELY) documents the grain for readers and the optimizer.",
          fixSnippet: `{{ config(\n    post_hook="ALTER TABLE {{ this }} ADD PRIMARY KEY (<key_column>) RELY"\n) }}`,
        }))
    },
    optional: true,
  },
]

// --- Inventory query ---

export const INVENTORY_QUERY = (c: AuditConfig): string => `
  SELECT TABLE_NAME, TABLE_CATALOG, TABLE_SCHEMA, TABLE_TYPE,
         ROW_COUNT, BYTES, CREATED, LAST_ALTERED, CLUSTERING_KEY
  FROM ${id(c.database)}.INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = UPPER('${id(c.schema)}')
    AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
  ORDER BY TABLE_NAME`

export function mapInventory(rows: Record<string, unknown>[]): ModelInfo[] {
  return rows.map((r) => ({
    name: String(r.TABLE_NAME ?? ""),
    database: String(r.TABLE_CATALOG ?? ""),
    schema: String(r.TABLE_SCHEMA ?? ""),
    kind: String(r.TABLE_TYPE ?? "TABLE"),
    rows: r.ROW_COUNT == null ? null : Number(r.ROW_COUNT),
    bytes: Number(r.BYTES ?? 0),
    createdOn: toIso(r.CREATED) ?? "",
    lastAltered: toIso(r.LAST_ALTERED) ?? "",
    clusterBy: r.CLUSTERING_KEY ? String(r.CLUSTERING_KEY) : null,
  }))
}

// --- Runner ---

export async function runAudit(
  query: QueryFn,
  config: AuditConfig,
  rules: AuditRule[] = CORE_RULES,
): Promise<AuditResult> {
  // The inventory is the audit's denominator. If it cannot be read, there is
  // no audit: fail loudly instead of reporting zero findings.
  let models: ModelInfo[]
  try {
    models = mapInventory(await query(INVENTORY_QUERY(config), { warehouse: config.warehouse }))
  } catch (e) {
    throw new Error(`Cannot read ${config.database}.INFORMATION_SCHEMA.TABLES: ${e instanceof Error ? e.message : String(e)}`)
  }

  const outcomes = await Promise.all(
    rules.map(async (rule) => {
      try {
        const rows = await query(rule.sql(config), { warehouse: config.warehouse })
        return { check: { rule: rule.id, name: rule.name, status: "ok" as const }, findings: rule.mapFindings(rows, config, models) }
      } catch (e) {
        return {
          check: { rule: rule.id, name: rule.name, status: "failed" as const, error: e instanceof Error ? e.message : String(e) },
          findings: [] as AuditFinding[],
        }
      }
    }),
  )

  const checks = outcomes.map((o) => o.check)
  const findings = outcomes.flatMap((o) => o.findings)
  const totalModels = models.length
  const errors = findings.filter((f) => f.severity === "error").length
  const warnings = findings.filter((f) => f.severity === "warning").length
  const infos = findings.filter((f) => f.severity === "info").length
  const requiredFailed = outcomes.some((o, i) => o.check.status === "failed" && !rules[i].optional)
  const score = requiredFailed ? null : computeScore(findings, totalModels)

  return {
    totalModels,
    errors,
    warnings,
    infos,
    score,
    checks,
    findings,
    models,
    config,
    runAt: new Date().toISOString(),
  }
}
