import { describe, it, expect, vi } from "vitest"
import { runAudit, computeScore, CORE_RULES, generateFixSnippet, type ModelInfo } from "../../lib/audit-engine"
import type { AuditConfig } from "../../lib/config"

const baseTable = (name: string): ModelInfo => ({
  name,
  database: "ANALYTICS_DB",
  schema: "ANALYTICS",
  kind: "BASE TABLE",
  rows: 1,
  bytes: 1,
  createdOn: "",
  lastAltered: "",
  clusterBy: null,
})

describe("audit-engine", () => {
  const mockConfig: AuditConfig = {
    database: "ANALYTICS_DB",
    schema: "ANALYTICS",
    warehouse: "COMPUTE_WH",
  }

  it("computes 100 with zero findings, and no score when nothing was analysed", () => {
    expect(computeScore([], 10)).toBe(100)
    expect(computeScore([], 0)).toBeNull()
  })

  it("computes penalty score with errors and warnings", () => {
    const findings = [
      { rule: "empty-model", severity: "error" as const, message: "Empty model" },
      { rule: "missing-clustering", severity: "warning" as const, message: "No cluster" },
    ]
    // penalty = (10 + 3) / 2 = 6.5 -> 100 - 65 = 35
    expect(computeScore(findings, 2)).toBe(35)
  })

  it("executes rules via queryFn and aggregates findings and models", async () => {
    const queryFn = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes(".TABLES") && sql.includes("CLUSTERING_KEY")) {
        return [
          {
            TABLE_NAME: "STG_ORDERS",
            TABLE_CATALOG: "ANALYTICS_DB",
            TABLE_SCHEMA: "ANALYTICS",
            TABLE_TYPE: "BASE TABLE",
            ROW_COUNT: 1000,
            BYTES: 50000,
            CREATED: "2026-01-01",
            LAST_ALTERED: "2026-09-01",
            CLUSTERING_KEY: null,
          },
          {
            TABLE_NAME: "EMPTY_TABLE",
            TABLE_CATALOG: "ANALYTICS_DB",
            TABLE_SCHEMA: "ANALYTICS",
            TABLE_TYPE: "BASE TABLE",
            ROW_COUNT: 0,
            BYTES: 0,
            CREATED: "2026-01-01",
            LAST_ALTERED: "2026-09-01",
            CLUSTERING_KEY: null,
          },
        ]
      }
      return []
    })

    const result = await runAudit(queryFn, mockConfig, CORE_RULES)
    expect(result.totalModels).toBe(2)
    expect(result.models.map((m) => m.name)).toEqual(["STG_ORDERS", "EMPTY_TABLE"])
    expect(result.findings.some((f) => f.rule === "empty-model" && f.model === "EMPTY_TABLE")).toBe(true)
  })

  it("reports an optional check that could not run as failed, not as zero findings", async () => {
    const queryFn = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("QUERY_HISTORY")) {
        throw new Error("Privileges missing for QUERY_HISTORY")
      }
      if (sql.includes("ORDER BY TABLE_NAME")) {
        return [{ TABLE_NAME: "FCT_ORDERS", TABLE_TYPE: "BASE TABLE", ROW_COUNT: 5 }]
      }
      return []
    })

    const result = await runAudit(queryFn, mockConfig, CORE_RULES)
    const failed = result.checks.filter((c) => c.status === "failed").map((c) => c.rule)
    expect(failed.sort()).toEqual(["recent-failure", "slow-query"])
    expect(result.checks.find((c) => c.rule === "recent-failure")?.error).toContain("Privileges missing")
    // Optional checks failing does not block the score of the checks that ran.
    expect(result.score).toBe(100)
  })

  it("does not score when a required check fails", async () => {
    const queryFn = vi.fn().mockImplementation(async (sql: string) => {
      if (sql.includes("ORDER BY TABLE_NAME")) return [{ TABLE_NAME: "FCT_ORDERS", TABLE_TYPE: "BASE TABLE", ROW_COUNT: 5 }]
      if (sql.includes("CLUSTERING_KEY IS NULL")) throw new Error("boom")
      return []
    })
    const result = await runAudit(queryFn, mockConfig, CORE_RULES)
    expect(result.score).toBeNull()
    expect(result.checks.find((c) => c.rule === "missing-clustering")?.status).toBe("failed")
  })

  it("fails the whole audit when the inventory cannot be read (no connection)", async () => {
    const queryFn = vi.fn().mockRejectedValue(new Error("No Snowflake credentials found"))
    await expect(runAudit(queryFn, mockConfig, CORE_RULES)).rejects.toThrow(/No Snowflake credentials found/)
  })

  it("refuses identifiers that could break out of the SQL text", async () => {
    const queryFn = vi.fn().mockResolvedValue([])
    const bad = { ...mockConfig, schema: "X\\' OR 1=1 --" }
    await expect(runAudit(queryFn, bad, CORE_RULES)).rejects.toThrow(/Invalid Snowflake identifier/)
    expect(queryFn).not.toHaveBeenCalled()
  })

  it("never recommends dropping a table", () => {
    const fix = generateFixSnippet({ rule: "stale-model", severity: "warning", message: "stale", model: "old_model" })
    expect(fix).not.toMatch(/DROP/i)
    for (const rule of CORE_RULES) {
      const findings = rule.mapFindings(
        [{ TABLE_NAME: "OLD_MODEL", TABLE_TYPE: "BASE TABLE", ROW_COUNT: 0, BYTES: 200000000, LAST_ALTERED: "2020-01-01" }],
        mockConfig,
        [baseTable("OLD_MODEL")],
      )
      for (const f of findings) expect(f.fixSnippet ?? "").not.toMatch(/DROP/i)
    }
  })

  describe("no-primary-key (port of the audit brick's R05b)", () => {
    const rule = CORE_RULES.find((r) => r.id === "no-primary-key")!
    const inventory = [baseTable("FCT_ORDERS"), baseTable("DIM_CUSTOMERS"), { ...baseTable("V_ORDERS"), kind: "VIEW" }]

    it("uses SHOW PRIMARY KEYS on the configured schema, at info severity", () => {
      expect(rule.sql(mockConfig)).toBe("SHOW PRIMARY KEYS IN SCHEMA ANALYTICS_DB.ANALYTICS")
      expect(rule.severity).toBe("info")
      expect(rule.optional).toBe(true)
    })

    it("flags base tables without a key, matching SHOW's lower-case columns case-insensitively, and ignores views", () => {
      const findings = rule.mapFindings([{ table_name: "fct_orders", database_name: "ANALYTICS_DB", schema_name: "ANALYTICS" }], mockConfig, inventory)
      expect(findings.map((f) => f.model)).toEqual(["DIM_CUSTOMERS"])
      expect(findings[0].severity).toBe("info")
      expect(findings[0].fixSnippet).toContain("PRIMARY KEY (<key_column>) RELY")
    })

    it("reports nothing when every base table has a key", () => {
      const rows = [{ table_name: "FCT_ORDERS" }, { table_name: "DIM_CUSTOMERS" }]
      expect(rule.mapFindings(rows, mockConfig, inventory)).toEqual([])
    })

    it("never lowers the score, and a refused SHOW is 'could not run' without cancelling the score", async () => {
      const inventoryRows = [{ TABLE_NAME: "FCT_ORDERS", TABLE_TYPE: "BASE TABLE", ROW_COUNT: 5 }]
      const keyless = await runAudit(
        vi.fn().mockImplementation(async (sql: string) => (sql.includes("ORDER BY TABLE_NAME") ? inventoryRows : [])),
        mockConfig,
        CORE_RULES,
      )
      expect(keyless.findings.filter((f) => f.rule === "no-primary-key")).toHaveLength(1)
      expect(keyless.score).toBe(100)

      const refused = await runAudit(
        vi.fn().mockImplementation(async (sql: string) => {
          if (sql.startsWith("SHOW PRIMARY KEYS")) throw new Error("Insufficient privileges")
          return sql.includes("ORDER BY TABLE_NAME") ? inventoryRows : []
        }),
        mockConfig,
        CORE_RULES,
      )
      expect(refused.checks.find((c) => c.rule === "no-primary-key")).toMatchObject({ status: "failed", error: "Insufficient privileges" })
      expect(refused.score).toBe(100)
    })
  })

  it("generates actionable 1-click fix snippets for audit findings", () => {
    const emptyFix = generateFixSnippet({ rule: "empty-model", severity: "error", message: "0 rows", model: "stg_orders" })
    expect(emptyFix).toContain("dbt run --full-refresh --select stg_orders")

    const clusterFix = generateFixSnippet({ rule: "missing-clustering", severity: "warning", message: "Large table", model: "fct_orders" })
    expect(clusterFix).toContain("cluster_by")

    const directJoinFix = generateFixSnippet({ rule: "direct-source-join", severity: "warning", message: "Source join", model: "orders" })
    expect(directJoinFix).toContain("ref('stg_orders')")
  })
})
