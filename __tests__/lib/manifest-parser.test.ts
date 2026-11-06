import { describe, it, expect } from "vitest"
import { auditDbtManifest, type DbtManifest } from "../../lib/manifest-parser"

describe("manifest-parser (dbt-project-evaluator heuristics)", () => {
  it("calculates test and doc coverage and flags direct source joins", () => {
    const mockManifest: DbtManifest = {
      nodes: {
        "model.my_project.stg_orders": {
          unique_id: "model.my_project.stg_orders",
          name: "stg_orders",
          resource_type: "model",
          description: "Staging table for orders",
          depends_on: {
            nodes: ["source.my_project.raw.orders"],
          },
        },
        "model.my_project.fct_orders": {
          unique_id: "model.my_project.fct_orders",
          name: "fct_orders",
          resource_type: "model",
          description: "Fact table for orders",
          depends_on: {
            // Real manifests put source dependencies in depends_on.nodes.
            nodes: ["model.my_project.stg_orders", "source.my_project.raw.customers"], // Direct source join violation!
          },
        },
        "model.my_project.legacy_bad_table": {
          unique_id: "model.my_project.legacy_bad_table",
          name: "legacy_bad_table", // Naming convention violation!
          resource_type: "model",
          description: "", // Undocumented!
        },
        "test.my_project.unique_stg_orders_id": {
          unique_id: "test.my_project.unique_stg_orders_id",
          name: "unique_stg_orders_id",
          resource_type: "test",
          depends_on: {
            nodes: ["model.my_project.stg_orders"],
          },
        },
      },
    }

    const summary = auditDbtManifest(mockManifest)
    expect(summary.totalModels).toBe(3)
    expect(summary.testedModels).toBe(1) // only stg_orders has a test
    expect(summary.documentedModels).toBe(2) // stg_orders and fct_orders
    expect(summary.testCoveragePct).toBe(33)
    expect(summary.docCoveragePct).toBe(67)

    // Direct source join violation
    expect(summary.directSourceViolations).toEqual([
      { model: "fct_orders", source: "raw.customers" },
    ])

    // Naming violation
    expect(summary.namingViolations.some((v) => v.model === "legacy_bad_table")).toBe(true)

    // No column shares a name and a description here
    expect(summary.sharedColumnGroups).toEqual([])
    expect(summary.sharedColumnCoveragePct).toBeNull()
  })

  it("reports shared-column groups and the coverage rate (confirmed groups over all groups)", () => {
    const col = (description: string, confirmed = false) => ({ name: "customer_id", description, meta: confirmed ? { shared_meaning_confirmed: true } : undefined })
    const m: DbtManifest = {
      nodes: {
        "model.p.fct_a": { unique_id: "model.p.fct_a", name: "fct_a", resource_type: "model", columns: { customer_id: col("The customer.", true), amount: { name: "amount", description: "Order amount." } } },
        "model.p.dim_b": { unique_id: "model.p.dim_b", name: "dim_b", resource_type: "model", columns: { customer_id: col("The customer.", true) } },
        "model.p.rpt_c": { unique_id: "model.p.rpt_c", name: "rpt_c", resource_type: "model", columns: { amount: { name: "amount", description: "Order amount." } } },
      },
    }
    const summary = auditDbtManifest(m)
    expect(summary.sharedColumnGroups.map((g) => [g.column, g.models, g.confirmed])).toEqual([
      ["customer_id", ["fct_a", "dim_b"], true],
      ["amount", ["fct_a", "rpt_c"], false],
    ])
    expect(summary.sharedColumnCoveragePct).toBe(50)
  })
})
