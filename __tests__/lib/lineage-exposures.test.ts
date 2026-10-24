import { describe, it, expect } from "vitest"
import { buildLineageNodes, countEdges, downstreamModels, exposureKey } from "../../lib/lineage-graph"
import type { DbtManifest } from "../../lib/manifest-parser"

const manifest = {
  nodes: {
    "model.p.fct_revenue": {
      name: "fct_revenue",
      resource_type: "model",
      unique_id: "model.p.fct_revenue",
      depends_on: { nodes: [] },
    },
  },
  exposures: {
    "exposure.p.revenue_review": {
      unique_id: "exposure.p.revenue_review",
      name: "revenue_review",
      label: "Revenue review",
      type: "dashboard",
      description: "Monthly review",
      depends_on: { nodes: ["model.p.fct_revenue", "model.p.not_in_graph"] },
    },
  },
} as unknown as DbtManifest

describe("exposures in the lineage graph", () => {
  const { nodes } = buildLineageNodes([], [], manifest)
  const exposure = nodes.find((n) => n.id === exposureKey("revenue_review"))

  it("adds each exposure as a node in its own layer", () => {
    expect(exposure).toBeDefined()
    expect(exposure?.type).toBe("exposure")
    expect(exposure?.layer).toBe("exposures")
    expect(exposure?.name).toBe("Revenue review")
    expect(exposure?.kind).toBe("DASHBOARD")
  })

  it("links the exposure to the models it depends on, both ways", () => {
    expect(exposure?.dependencies).toContain("fct_revenue")
    expect(nodes.find((n) => n.id === "fct_revenue")?.dependents).toContain(exposureKey("revenue_review"))
    expect(countEdges(nodes)).toBe(1)
  })

  it("keeps exposures out of the downstream model count", () => {
    expect(downstreamModels(nodes, "fct_revenue")).toEqual([])
  })

  it("adds no exposure node when the manifest has none", () => {
    const plain = buildLineageNodes([], [], { nodes: manifest.nodes } as DbtManifest)
    expect(plain.nodes.some((n) => n.type === "exposure")).toBe(false)
  })
})
