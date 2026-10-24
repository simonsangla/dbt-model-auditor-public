import { describe, it, expect } from "vitest"
import { matchInventoryToManifest, scopeAuditToDbt } from "../../lib/dbt-identity"
import type { AuditResult, ModelInfo } from "../../lib/audit-engine"
import type { DbtManifest } from "../../lib/manifest-parser"

// Node shape taken from a real `dbt parse` manifest (schema v12): lower-case
// names, database/schema/alias on every model, materialization under config,
// sources referenced from depends_on.nodes.
const manifest: DbtManifest = {
  nodes: {
    "model.shop.orders": {
      unique_id: "model.shop.orders", name: "orders", resource_type: "model",
      database: "analytics", schema: "core", alias: "orders", config: { materialized: "table" },
      depends_on: { nodes: ["model.shop.stg_orders"] },
    },
    "model.shop.stg_orders": {
      unique_id: "model.shop.stg_orders", name: "stg_orders", resource_type: "model",
      database: "analytics", schema: "core", alias: "stg_orders", config: { materialized: "view" },
      depends_on: { nodes: ["source.shop.raw.orders"] },
    },
    // alias differs from name: the relation is CUSTOMERS_V2
    "model.shop.dim_customers": {
      unique_id: "model.shop.dim_customers", name: "dim_customers", resource_type: "model",
      database: "analytics", schema: "core", alias: "customers_v2", config: { materialized: "table" },
    },
    // built but missing in Snowflake
    "model.shop.fct_payments": {
      unique_id: "model.shop.fct_payments", name: "fct_payments", resource_type: "model",
      database: "analytics", schema: "core", alias: "fct_payments", config: { materialized: "incremental" },
    },
    // ephemeral: never a relation, never "missing"
    "model.shop.int_helper": {
      unique_id: "model.shop.int_helper", name: "int_helper", resource_type: "model",
      database: "analytics", schema: "core", alias: "int_helper", config: { materialized: "ephemeral" },
    },
    // another schema: out of scope entirely
    "model.shop.mart_elsewhere": {
      unique_id: "model.shop.mart_elsewhere", name: "mart_elsewhere", resource_type: "model",
      database: "analytics", schema: "marts", alias: "mart_elsewhere", config: { materialized: "table" },
    },
    "test.shop.unique_orders_id": {
      unique_id: "test.shop.unique_orders_id", name: "unique_orders_id", resource_type: "test",
      depends_on: { nodes: ["model.shop.orders"] },
    },
  },
}

const obj = (name: string, kind = "BASE TABLE"): ModelInfo => ({
  name, database: "ANALYTICS", schema: "CORE", kind, rows: 1, bytes: 1, createdOn: "", lastAltered: "", clusterBy: null,
})

// Snowflake reports unquoted identifiers in upper case.
const inventory = [obj("ORDERS"), obj("STG_ORDERS", "VIEW"), obj("CUSTOMERS_V2"), obj("LEGACY_EXPORT"), obj("MART_ELSEWHERE")]
const config = { database: "ANALYTICS", schema: "CORE" }

describe("matchInventoryToManifest", () => {
  const scope = matchInventoryToManifest(inventory, manifest, config)

  it("matches case-insensitively and by alias, not by model name", () => {
    expect(scope.dbtModels.map((m) => m.name)).toEqual(["ORDERS", "STG_ORDERS", "CUSTOMERS_V2"])
  })

  it("lists schema objects no model builds, including a same-named model built in another schema", () => {
    expect(scope.notInManifest.map((m) => m.name)).toEqual(["LEGACY_EXPORT", "MART_ELSEWHERE"])
  })

  it("lists targeted models missing in Snowflake, and never an ephemeral one", () => {
    expect(scope.missingInSnowflake.map((n) => n.name)).toEqual(["fct_payments"])
    expect(scope.targetedCount).toBe(4) // ephemeral and other-schema models are not targeted
  })

  it("reports zero targeted models when the manifest builds into another schema", () => {
    const other = matchInventoryToManifest(inventory, manifest, { database: "ANALYTICS", schema: "STAGING" })
    expect(other.targetedCount).toBe(0)
    expect(other.dbtModels).toEqual([])
    expect(other.missingInSnowflake).toEqual([])
  })
})

describe("scopeAuditToDbt", () => {
  const base: AuditResult = {
    totalModels: inventory.length,
    errors: 1, warnings: 1, infos: 0, score: 50, checks: [],
    findings: [
      { rule: "empty-model", severity: "error", message: "empty", model: "LEGACY_EXPORT" },
      { rule: "missing-clustering", severity: "warning", message: "big", model: "ORDERS" },
      { rule: "recent-failure", severity: "error", message: "failed query" }, // schema-level: kept
    ],
    models: inventory,
    config: { ...config, warehouse: "WH" },
    runAt: "2026-09-23T00:00:00Z",
  }
  const scoped = scopeAuditToDbt(base, matchInventoryToManifest(inventory, manifest, config))

  it("keeps findings on dbt models and schema-level findings, drops the rest", () => {
    expect(scoped.findings.map((f) => f.rule)).toEqual(["missing-clustering", "recent-failure", "dbt-model-not-built"])
  })

  it("raises a warning for each model missing in Snowflake", () => {
    const notBuilt = scoped.findings.find((f) => f.rule === "dbt-model-not-built")!
    expect(notBuilt).toMatchObject({ severity: "warning", model: "fct_payments" })
  })

  it("recomputes counts and score over dbt models only", () => {
    expect(scoped.totalModels).toBe(3)
    expect(scoped.models.map((m) => m.name)).toEqual(["ORDERS", "STG_ORDERS", "CUSTOMERS_V2"])
    expect([scoped.errors, scoped.warnings, scoped.infos]).toEqual([1, 2, 0])
    // penalty = (1*10 + 2*3) / 3 = 5.33 -> 100 - 53 = 47
    expect(scoped.score).toBe(47)
  })

  it("keeps a null score null (the original run could not be scored)", () => {
    const unscored = scopeAuditToDbt({ ...base, score: null }, matchInventoryToManifest(inventory, manifest, config))
    expect(unscored.score).toBeNull()
  })
})
