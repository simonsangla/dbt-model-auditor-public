import { describe, expect, it } from "vitest"
import { buildLineageNodes, downstreamModels, isRiskyEdgeSource, propagationOf } from "@/lib/lineage-graph"
import type { DbtManifest } from "@/lib/manifest-parser"
import type { AuditFinding } from "@/lib/audit-engine"

const manifest = {
  sources: { "source.p.raw.orders": { unique_id: "source.p.raw.orders", name: "orders", source_name: "raw" } },
  nodes: {
    "model.p.stg_orders": { unique_id: "model.p.stg_orders", name: "stg_orders", resource_type: "model", depends_on: { nodes: ["source.p.raw.orders"] } },
    "model.p.int_a": { unique_id: "model.p.int_a", name: "int_a", resource_type: "model", depends_on: { nodes: ["model.p.stg_orders"] } },
    "model.p.fct_b": { unique_id: "model.p.fct_b", name: "fct_b", resource_type: "model", depends_on: { nodes: ["model.p.int_a", "model.p.stg_orders"] } },
  },
} as DbtManifest

const findings: AuditFinding[] = [
  { rule: "source-freshness-missing", severity: "warning", model: "source:orders", message: "x" },
  { rule: "naming", severity: "info", model: "int_a", message: "y" },
]

describe("issue propagation", () => {
  const { nodes } = buildLineageNodes([], findings, manifest)
  it("attaches a source finding to the source node", () => {
    expect(nodes.find((n) => n.id === "source:orders")!.findings).toHaveLength(1)
  })
  it("counts transitive downstream models once each", () => {
    expect(downstreamModels(nodes, "source:orders").sort()).toEqual(["fct_b", "int_a", "stg_orders"])
    expect(downstreamModels(nodes, "fct_b")).toEqual([])
  })
  it("propagationOf counts error+warning findings only", () => {
    expect(propagationOf(nodes, "source:orders")).toEqual({ issues: 1, downstream: 3 })
    expect(propagationOf(nodes, "int_a")).toEqual({ issues: 0, downstream: 1 })
  })
  it("edges leave a risky node only when it has error or warning findings", () => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    expect(isRiskyEdgeSource(byId.get("source:orders"))).toBe(true)
    expect(isRiskyEdgeSource(byId.get("int_a"))).toBe(false)
    expect(isRiskyEdgeSource(undefined)).toBe(false)
  })
})
