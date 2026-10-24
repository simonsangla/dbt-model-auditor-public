export interface AuditConfig {
  warehouse: string
  database: string
  schema: string
  githubRepo?: string
  /** Set only by the explicit demo choice in /setup: show the bundled sample, never query Snowflake. */
  demo?: boolean
}

export const CONFIG_KEY = "dbt-auditor-config"

export function configToParams(config: AuditConfig): URLSearchParams {
  const p = new URLSearchParams()
  p.set("db", config.database)
  p.set("schema", config.schema)
  p.set("wh", config.warehouse)
  if (config.githubRepo) p.set("repo", config.githubRepo)
  return p
}

export function parseConfigFromParams(params: URLSearchParams): AuditConfig | null {
  const db = params.get("db")
  const schema = params.get("schema")
  const wh = params.get("wh")
  if (!db || !schema || !wh) return null
  return {
    database: db,
    schema: schema,
    warehouse: wh,
    githubRepo: params.get("repo") || undefined,
  }
}

// Snowflake unquoted identifier: letters, digits, _ and $, not starting with a digit.
// Unquoted identifiers resolve case-insensitively, and restricting input to this
// shape is what makes interpolating them into SQL safe (no quotes, no backslashes).
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]{0,254}$/

export function isIdentifier(value: string): boolean {
  return IDENTIFIER.test(value)
}

/** Returns an error message for the first invalid field, or null when the config is usable. */
export function validateConfig(config: AuditConfig): string | null {
  for (const [field, value] of [
    ["database", config.database],
    ["schema", config.schema],
    ["warehouse", config.warehouse],
  ] as const) {
    if (!isIdentifier(value)) {
      return `Invalid ${field} name ${JSON.stringify(value)}: use an unquoted Snowflake identifier (letters, digits, _ or $).`
    }
  }
  return null
}
