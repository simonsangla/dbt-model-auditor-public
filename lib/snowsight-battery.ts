/**
 * Zero-install Snowsight SQL audit battery.
 *
 * Generates a read-only SQL script (SELECT and SHOW only) to paste into a
 * Snowsight worksheet. Each step returns its own result set; the operator
 * copies the step 1 row (and optionally the step 2 array) back into the app.
 *
 * Deliberately NOT included: Cortex token/credit usage. The view the previous
 * version queried, SNOWFLAKE.ACCOUNT_USAGE.CORTEX_FUNCTIONS_USAGE_HISTORY, is
 * no longer updated (https://docs.snowflake.com/en/sql-reference/account-usage/cortex_functions_usage_history),
 * and the columns of its replacement have not been verified here.
 */

export interface SnowsightBatteryConfig {
  database?: string
  schema?: string
  daysHistory?: number
}

// Snowflake unquoted identifier: letters, digits, _ and $, not starting with a digit.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/

function identifierLiteral(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  if (!IDENTIFIER.test(value)) {
    throw new Error(`Invalid Snowflake identifier: ${JSON.stringify(value)}`)
  }
  return `'${value}'`
}

export function generateSnowsightAuditScript(config: SnowsightBatteryConfig = {}): string {
  const db = identifierLiteral(config.database, "CURRENT_DATABASE()")
  const sch = identifierLiteral(config.schema, "CURRENT_SCHEMA()")
  const days = Number.isInteger(config.daysHistory) && config.daysHistory! > 0 ? config.daysHistory! : 30

  return `-- =============================================================================
-- SNOWFLAKE READ-ONLY AUDIT BATTERY
-- =============================================================================
-- Read-only: SELECT and SHOW statements only. No DDL, no DML, no table rows read.
-- Paste into a Snowsight worksheet and run all. Each step returns its own result.
-- =============================================================================

-- Step 1: Environment summary (copy this single JSON cell into the app)
SELECT OBJECT_CONSTRUCT(
    'audited_at', CURRENT_TIMESTAMP(),
    'current_account', CURRENT_ACCOUNT(),
    'current_region', CURRENT_REGION(),
    'current_role', CURRENT_ROLE(),
    'current_warehouse', CURRENT_WAREHOUSE(),
    'current_database', ${db},
    'current_schema', ${sch}
) AS env_summary;

-- Step 2: Queries that spilled to disk in the last ${days} days (top 15)
SELECT COALESCE(ARRAY_AGG(OBJECT_CONSTRUCT(
    'query_id', QUERY_ID,
    'warehouse_name', WAREHOUSE_NAME,
    'warehouse_size', WAREHOUSE_SIZE,
    'execution_time_sec', ROUND(TOTAL_ELAPSED_TIME / 1000, 1),
    'bytes_spilled_local_gb', ROUND(BYTES_SPILLED_TO_LOCAL_STORAGE / (1024*1024*1024), 2),
    'bytes_spilled_remote_gb', ROUND(BYTES_SPILLED_TO_REMOTE_STORAGE / (1024*1024*1024), 2)
)), ARRAY_CONSTRUCT()) AS spillage_bottlenecks
FROM (
    SELECT
        QUERY_ID,
        WAREHOUSE_NAME,
        WAREHOUSE_SIZE,
        TOTAL_ELAPSED_TIME,
        BYTES_SPILLED_TO_LOCAL_STORAGE,
        BYTES_SPILLED_TO_REMOTE_STORAGE
    FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY
    WHERE START_TIME >= DATEADD('day', -${days}, CURRENT_TIMESTAMP())
      AND (BYTES_SPILLED_TO_LOCAL_STORAGE > 0 OR BYTES_SPILLED_TO_REMOTE_STORAGE > 0)
    ORDER BY BYTES_SPILLED_TO_REMOTE_STORAGE DESC, BYTES_SPILLED_TO_LOCAL_STORAGE DESC
    LIMIT 15
);

-- Step 3: Cortex Search services and semantic views visible to this role
SHOW CORTEX SEARCH SERVICES;
SHOW SEMANTIC VIEWS;`
}

/** Every field is null when the pasted JSON does not contain it. Nothing is invented. */
export interface ParsedSnowsightAudit {
  account: string | null
  region: string | null
  role: string | null
  warehouse: string | null
  spillQueriesFound: number | null
}

export type ParseResult =
  | { ok: true; audit: ParsedSnowsightAudit }
  | { ok: false; error: string }

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

export function parseSnowsightJsonOutput(rawJson: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(rawJson)
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "Expected the step 1 JSON object (env_summary)." }
  }
  const d = data as Record<string, unknown>
  return {
    ok: true,
    audit: {
      account: str(d.current_account),
      region: str(d.current_region),
      role: str(d.current_role),
      warehouse: str(d.current_warehouse),
      spillQueriesFound: Array.isArray(d.spillage_bottlenecks) ? d.spillage_bottlenecks.length : null,
    },
  }
}
