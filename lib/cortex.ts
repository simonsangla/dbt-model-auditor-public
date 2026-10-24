/**
 * Snowflake Cortex AI Engine for dbt Model Auditing & Intelligence.
 *
 * Sends a dbt model's SQL to SNOWFLAKE.CORTEX.COMPLETE with a task prompt.
 * This is an explicit, operator-triggered call and it consumes Cortex credits.
 * There is no offline fallback: if Cortex cannot be reached the request fails,
 * because a canned answer would read as an analysis of the submitted SQL.
 */

import { querySnowflake } from "./snowflake"

import { isCortexModel, isCortexTask, type CortexModel, type CortexTask } from "./cortex-models"

export { CORTEX_MODELS, CORTEX_TASKS, isCortexModel, isCortexTask } from "./cortex-models"
export type { CortexModel, CortexTask } from "./cortex-models"

export interface CortexAuditRequest {
  modelName: string
  sqlCode: string
  task: CortexTask
  cortexModel?: CortexModel
  warehouse?: string
}

export interface CortexAuditResponse {
  modelName: string
  task: CortexTask
  output: string
  modelUsed: string
  latencyMs: number
  generatedAt: string
}

function buildPrompt(task: CortexTask, modelName: string, sqlCode: string): string {
  switch (task) {
    case "document":
      return `You are an expert analytics engineer. Analyze the following dbt model SQL and generate clean, production-ready dbt YAML documentation (schema.yml) including:
1. High-level model description explaining business purpose
2. Column-by-column descriptions with data types
3. Recommended generic tests (unique, not_null, accepted_values)

Model Name: ${modelName}
SQL:
\`\`\`sql
${sqlCode}
\`\`\`

Output ONLY clean YAML format ready to paste into models/schema.yml.`

    case "explain":
      return `You are an expert analytics engineer and data translator. Explain the following dbt SQL model in plain, structured English so both non-technical stakeholders and junior developers can understand:
1. What business entity or question this model represents
2. Step-by-step summary of CTEs and joins
3. Key business metrics calculated
4. Potential edge cases (null handling, date logic)

Model Name: ${modelName}
SQL:
\`\`\`sql
${sqlCode}
\`\`\``

    case "audit_anti_patterns":
      return `You are a principal Snowflake & dbt architect performing a strict adversarial code review. Audit the following SQL model for performance, cost, and architecture anti-patterns:
1. Cartesian / Fanout join risks (missing join keys or non-unique keys)
2. Micro-partition pruning anti-patterns (e.g. functions wrapping partition columns in WHERE clause)
3. Direct source join violations (bypassing staging)
4. Redundant CTEs or subqueries
5. Actionable, optimized refactored SQL

Model Name: ${modelName}
SQL:
\`\`\`sql
${sqlCode}
\`\`\``

    case "generate_unit_tests":
      return `You are a dbt core testing specialist. Generate modern dbt unit tests (dbt v1.8+ unit_tests format) for this SQL model:
1. Define mock input data for upstream ref() / source() models
2. Define expected output rows testing edge cases (nulls, boundary values, zero amounts)
3. Return valid YAML format

Model Name: ${modelName}
SQL:
\`\`\`sql
${sqlCode}
\`\`\``
  }
}

type QueryFn = typeof querySnowflake

/**
 * Runs the task on Snowflake Cortex. Model and prompt travel as bind variables,
 * never interpolated into the SQL text. Throws when Cortex returns nothing.
 */
export async function runCortexAudit(
  request: CortexAuditRequest,
  query: QueryFn = querySnowflake,
): Promise<CortexAuditResponse> {
  const startTime = Date.now()
  const modelToUse = request.cortexModel ?? "mistral-large2"
  if (!isCortexModel(modelToUse)) {
    throw new Error(`Unsupported Cortex model: ${JSON.stringify(modelToUse)}`)
  }
  if (!isCortexTask(request.task)) {
    throw new Error(`Unsupported task: ${JSON.stringify(request.task)}`)
  }
  const prompt = buildPrompt(request.task, request.modelName, request.sqlCode)

  const rows = await query("SELECT SNOWFLAKE.CORTEX.COMPLETE(?, ?) AS AI_OUTPUT", {
    warehouse: request.warehouse,
    callersRights: true,
    binds: [modelToUse, prompt],
  })
  const output = (rows?.[0]?.AI_OUTPUT as string) || (rows?.[0]?.ai_output as string)
  if (!output || output.trim().length === 0) {
    throw new Error("Snowflake Cortex returned an empty response.")
  }
  return {
    modelName: request.modelName,
    task: request.task,
    output: output.trim(),
    modelUsed: `Snowflake Cortex (${modelToUse})`,
    latencyMs: Date.now() - startTime,
    generatedAt: new Date().toISOString(),
  }
}
