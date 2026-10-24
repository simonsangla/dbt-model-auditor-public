import { describe, it, expect } from "vitest"
import { generateSnowsightAuditScript, parseSnowsightJsonOutput } from "../../lib/snowsight-battery"

describe("Snowsight battery generator", () => {
  it("emits only SELECT and SHOW statements", () => {
    const sql = generateSnowsightAuditScript({ daysHistory: 30 })
    const statements = sql
      .split(";")
      .map((s) => s.replace(/--.*$/gm, "").trim())
      .filter(Boolean)
    expect(statements.length).toBeGreaterThanOrEqual(3)
    for (const st of statements) {
      expect(st).toMatch(/^(SELECT|SHOW)\b/i)
    }
    expect(sql).toContain("SHOW CORTEX SEARCH SERVICES")
    expect(sql).toContain("BYTES_SPILLED_TO_REMOTE_STORAGE")
  })

  it("does not query the frozen CORTEX_FUNCTIONS_USAGE_HISTORY view", () => {
    expect(generateSnowsightAuditScript()).not.toContain("CORTEX_FUNCTIONS_USAGE_HISTORY")
  })

  it("rejects a database name that is not a plain identifier", () => {
    expect(() => generateSnowsightAuditScript({ database: "X'; DROP TABLE t; --" })).toThrow(/Invalid Snowflake identifier/)
    expect(generateSnowsightAuditScript({ database: "ANALYTICS_DB" })).toContain("'ANALYTICS_DB'")
  })
})

describe("Snowsight battery parser", () => {
  it("returns what the JSON contains", () => {
    const parsed = parseSnowsightJsonOutput(
      JSON.stringify({
        current_account: "ACME_PROD",
        current_region: "AWS_EU_WEST_1",
        current_role: "AUDITOR",
        current_warehouse: "AUDIT_WH",
        spillage_bottlenecks: [{ query_id: "q1" }],
      }),
    )
    expect(parsed).toEqual({
      ok: true,
      audit: { account: "ACME_PROD", region: "AWS_EU_WEST_1", role: "AUDITOR", warehouse: "AUDIT_WH", spillQueriesFound: 1 },
    })
  })

  it("never invents values for missing fields", () => {
    const parsed = parseSnowsightJsonOutput("{}")
    expect(parsed).toEqual({
      ok: true,
      audit: { account: null, region: null, role: null, warehouse: null, spillQueriesFound: null },
    })
  })

  it("reports invalid input as an error instead of a result", () => {
    const parsed = parseSnowsightJsonOutput("not json")
    expect(parsed.ok).toBe(false)
    expect(parseSnowsightJsonOutput("[1,2]").ok).toBe(false)
  })
})
