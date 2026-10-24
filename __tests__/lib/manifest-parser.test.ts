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
  })
})
