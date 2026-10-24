import { describe, expect, it } from "vitest"
import { REVENUE_VARIANCE_FINDINGS, REVENUE_VARIANCE_MANIFEST, manifestFindings } from "@/lib/revenue-variance-sample"
import type { DbtManifest } from "@/lib/manifest-parser"

describe("revenue-variance sample", () => {
  const nodes = Object.values(REVENUE_VARIANCE_MANIFEST.nodes)

  it("holds the 5 committed models plus the 4 planted-defect models (audit_demo var)", () => {
    const models = nodes.filter((n) => n.resource_type === "model")
    expect(models.map((m) => m.name).sort()).toEqual([
      "customer_ltv", "fct_monthly_revenue", "fct_revenue_variance", "int_orders_enriched",
      "legacy_margin", "rpt_budget_gap", "stg_budget", "stg_orders", "stg_products",
    ])
    expect(nodes.length).toBe(31)
    expect(nodes.filter((n) => n.resource_type === "test").length).toBe(19)
  })

  it("the planted defects yield exactly 7 findings, none on the clean public models", () => {
    expect(REVENUE_VARIANCE_FINDINGS.map((f) => `${f.rule}:${f.model}`).sort()).toEqual([
      "direct-source-join:customer_ltv",
      "naming:customer_ltv",
      "naming:legacy_margin",
      "undocumented-model:customer_ltv",
      "undocumented-model:rpt_budget_gap",
      "untested-model:customer_ltv",
      "untested-model:int_orders_enriched",
    ])
    expect(REVENUE_VARIANCE_FINDINGS.filter((f) => f.severity === "warning").length).toBe(3)
  })

  it("positive control: a bare model raises untested, undocumented, naming and source findings", () => {
    const m: DbtManifest = {
      nodes: { "model.p.customer_ltv": { unique_id: "model.p.customer_ltv", name: "customer_ltv", resource_type: "model", depends_on: { nodes: ["source.p.raw.orders"] } } },
      sources: {},
    }
    expect(manifestFindings(m).map((f) => f.rule).sort()).toEqual(["direct-source-join", "naming", "undocumented-model", "untested-model"])
  })
})
