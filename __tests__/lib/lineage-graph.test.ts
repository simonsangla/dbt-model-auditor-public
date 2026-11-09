import { describe, it, expect } from "vitest"
import { buildLineageNodes, countEdges, sourceKey } from "../../lib/lineage-graph"
import type { DbtManifest } from "../../lib/manifest-parser"
import type { AuditFinding, ModelInfo } from "../../lib/audit-engine"

const manifest = {
  sources: {
    "source.p.raw.orders": { name: "orders", unique_id: "source.p.raw.orders" },
  },
  nodes: {
    "model.p.stg_orders": {
      name: "stg_orders",
      resource_type: "model",
      unique_id: "model.p.stg_orders",
      depends_on: { nodes: ["source.p.raw.orders"] },
    },
    "model.p.legacy_margin": {
      name: "legacy_margin",
      resource_type: "model",
      unique_id: "model.p.legacy_margin",
      depends_on: { nodes: ["model.p.stg_orders", "seed.p.orders"] },
    },
  },
} as unknown as DbtManifest

describe("buildLineageNodes", () => {
  it("keeps same-named models from different packages as separate nodes", () => {
    const homonyms = {
      nodes: {
        "model.pkg_a.orders": {
          name: "orders",
          resource_type: "model",
          unique_id: "model.pkg_a.orders",
          depends_on: { nodes: [] },
        },
        "model.pkg_b.orders": {
          name: "orders",
          resource_type: "model",
          unique_id: "model.pkg_b.orders",
          depends_on: { nodes: [] },
        },
        "model.pkg_a.report": {
          name: "report",
          resource_type: "model",
          unique_id: "model.pkg_a.report",
          depends_on: { nodes: ["model.pkg_a.orders"] },
        },
      },
    } as unknown as DbtManifest

    const { nodes } = buildLineageNodes([], [], homonyms)
    expect(nodes.filter((n) => n.name === "orders").map((n) => n.id)).toEqual([
      "model.pkg_a.orders",
      "model.pkg_b.orders",
    ])
    const report = nodes.find((n) => n.name === "report")
    expect(report?.dependencies).toEqual(["model.pkg_a.orders"])
    expect(nodes.find((n) => n.id === "model.pkg_a.orders")?.dependents).toEqual([report?.id])
  })

  it("counts info-only findings as info health and in stats", () => {
    const findings: AuditFinding[] = [
      { rule: "naming", severity: "info", model: "legacy_margin", message: "bad name", category: "dbt Architecture" } as AuditFinding,
    ]
    const { nodes, stats } = buildLineageNodes([], findings, manifest)
    expect(nodes.find((n) => n.id === "legacy_margin")?.health).toBe("info")
    expect(stats.infoCount).toBe(1)
    expect(stats.healthyCount).toBe(stats.total - 1)
  })

  it("keeps a source and a seed/model of the same name as distinct nodes", () => {
    const models = [{ name: "ORDERS", kind: "TABLE", rows: 10, bytes: 100 }] as unknown as ModelInfo[]
    const { nodes } = buildLineageNodes(models, [], manifest)
    const src = nodes.find((n) => n.id === sourceKey("orders"))
    const seed = nodes.find((n) => n.id === "orders")
    expect(src?.type).toBe("source")
    expect(src?.name).toBe("orders")
    expect(seed?.type).toBe("model")
    expect(nodes.find((n) => n.id === "stg_orders")?.dependencies).toEqual(["source:orders"])
    expect(nodes.find((n) => n.id === "legacy_margin")?.dependencies).toEqual(["stg_orders", "orders"])
    expect(src?.dependents).toEqual(["stg_orders"])
    expect(seed?.dependents).toEqual(["legacy_margin"])
    expect(countEdges(nodes)).toBe(3)
  })
})
