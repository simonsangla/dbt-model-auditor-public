// Client-safe constants: no server imports here, so browser components can use them.
export const CORTEX_MODELS = ["mistral-large2", "llama3.1-70b", "snowflake-arctic", "claude-3-5-sonnet"] as const
export type CortexModel = (typeof CORTEX_MODELS)[number]

export const CORTEX_TASKS = ["document", "explain", "audit_anti_patterns", "generate_unit_tests"] as const
export type CortexTask = (typeof CORTEX_TASKS)[number]

export function isCortexModel(value: unknown): value is CortexModel {
  return typeof value === "string" && (CORTEX_MODELS as readonly string[]).includes(value)
}

export function isCortexTask(value: unknown): value is CortexTask {
  return typeof value === "string" && (CORTEX_TASKS as readonly string[]).includes(value)
}
