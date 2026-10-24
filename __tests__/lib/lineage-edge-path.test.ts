import { describe, it, expect } from "vitest"
import { edgePath } from "../../lib/lineage-graph"

// Card anchors as measured from the DOM: left edge, right edge, vertical centre.
const stg = { x1: 400, x2: 690, y: 100 }
const fctA = { x1: 1087, x2: 1380, y: 150 }
const fctB = { x1: 1087, x2: 1380, y: 300 }

describe("edgePath", () => {
  it("draws a left-to-right edge from the source's right side to the target's left side", () => {
    const d = edgePath(stg, fctA)
    expect(d).not.toBeNull()
    expect(d?.startsWith("M 690 100")).toBe(true)
    expect(d?.endsWith("1087 150")).toBe(true)
  })

  // Regression (#1582 5a): marts -> marts deps sit in the same column and were
  // dropped, so the revenue sample drew 6 of 9 edges.
  it("draws a same-column edge as a loop on the column's right side", () => {
    const d = edgePath(fctA, fctB)
    expect(d).not.toBeNull()
    expect(d?.startsWith("M 1380 150")).toBe(true)
    expect(d?.endsWith("1380 300")).toBe(true)
    const xs = (d as string).match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, i) => i % 2 === 0)
    expect(Math.max(...xs)).toBeGreaterThan(1380)
  })

  it("returns null for a backward edge across columns", () => {
    expect(edgePath(fctA, stg)).toBeNull()
  })
})
