/**
 * Snowflake Cortex infrastructure inventory (metadata only).
 *
 * Lists the Cortex Search services and semantic views visible to the caller in
 * the configured database/schema, using SHOW commands only. It does not call
 * any Cortex function (that would consume credits) and reports every check it
 * could not run as `failed` with the reason, instead of substituting sample data.
 *
 * Deliberately NOT reported: token/credit usage (the view the previous version
 * read, CORTEX_FUNCTIONS_USAGE_HISTORY, is no longer updated per
 * https://docs.snowflake.com/en/sql-reference/account-usage/cortex_functions_usage_history),
 * available models, RBAC status and a readiness score, none of which the
 * previous version measured.
 */

import { querySnowflake } from "./snowflake"
import { isIdentifier, type AuditConfig } from "./config"
import type { CheckStatus } from "./audit-engine"

export interface CortexSearchServiceInfo {
  name: string
  database: string | null
  schema: string | null
  createdOn: string | null
  comment: string | null
}

export interface CortexSemanticViewInfo {
  name: string
  database: string | null
  schema: string | null
  createdOn: string | null
  comment: string | null
}

export interface CortexInfraAuditResult {
  checks: CheckStatus[]
  searchServices: CortexSearchServiceInfo[]
  semanticViews: CortexSemanticViewInfo[]
  auditedAt: string
}

type QueryFn = typeof querySnowflake

function field(row: Record<string, unknown>, key: string): string | null {
  const v = row[key] ?? row[key.toUpperCase()]
  if (v === null || v === undefined || v === "") return null
  return v instanceof Date ? v.toISOString() : String(v)
}

function mapObject(row: Record<string, unknown>) {
  return {
    name: field(row, "name") ?? "",
    database: field(row, "database_name"),
    schema: field(row, "schema_name"),
    createdOn: field(row, "created_on"),
    comment: field(row, "comment"),
  }
}

export async function auditCortexInfra(
  config: AuditConfig,
  query: QueryFn = querySnowflake,
): Promise<CortexInfraAuditResult> {
  if (!isIdentifier(config.database) || !isIdentifier(config.schema)) {
    throw new Error("Invalid database or schema name")
  }
  const scope = `${config.database}.${config.schema}`
  const opts = { warehouse: config.warehouse, callersRights: true }

  const run = async <T>(rule: string, name: string, sql: string, map: (r: Record<string, unknown>) => T) => {
    try {
      const rows = await query(sql, opts)
      return { check: { rule, name, status: "ok" as const }, items: rows.map(map) }
    } catch (e) {
      return {
        check: { rule, name, status: "failed" as const, error: e instanceof Error ? e.message : String(e) },
        items: [] as T[],
      }
    }
  }

  const [search, views] = await Promise.all([
    run("cortex-search-services", "Cortex Search services", `SHOW CORTEX SEARCH SERVICES IN SCHEMA ${scope}`, mapObject),
    run("semantic-views", "Semantic views", `SHOW SEMANTIC VIEWS IN SCHEMA ${scope}`, mapObject),
  ])

  return {
    checks: [search.check, views.check],
    searchServices: search.items,
    semanticViews: views.items,
    auditedAt: new Date().toISOString(),
  }
}
