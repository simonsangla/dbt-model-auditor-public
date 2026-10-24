import { describe, it, expect } from "vitest"
import { parseSelector, selectNodes, type LineageNode } from "../../lib/lineage-graph"

// a -> b -> c -> d, and a -> e
function node(id: string, dependencies: string[], dependents: string[]): LineageNode {
  return { id, name: id, layer: "marts", type: "model", dependencies, dependents, findings: [], health: "healthy" }
}
const nodes = [
  node("a", [], ["b", "e"]),
  node("b", ["a"], ["c"]),
  node("c", ["b"], ["d"]),
  node("d", ["c"], []),
  node("e", ["a"], []),
]
const sel = (q: string) => {
  const s = selectNodes(nodes, q)
  return s ? [...s.ids].sort() : null
}

describe("parseSelector", () => {
  it("returns null for plain text so free-text search still applies", () => {
    expect(parseSelector("orders")).toBeNull()
    expect(parseSelector("")).toBeNull()
  })
  it("reads graph operators and depths", () => {
    expect(parseSelector("+c")).toEqual({ name: "c", up: Infinity, down: 0 })
    expect(parseSelector("c+")).toEqual({ name: "c", up: 0, down: Infinity })
    expect(parseSelector("2+c+1")).toEqual({ name: "c", up: 2, down: 1 })
  })
})

describe("selectNodes (dbt graph operators)", () => {
  it("+c selects c and all its ancestors", () => expect(sel("+c")).toEqual(["a", "b", "c"]))
  it("c+ selects c and all its descendants", () => expect(sel("c+")).toEqual(["c", "d"]))
  it("+b+ selects both directions", () => expect(sel("+b+")).toEqual(["a", "b", "c", "d"]))
  it("1+c limits ancestor depth", () => expect(sel("1+c")).toEqual(["b", "c"]))
  it("a+1 limits descendant depth", () => expect(sel("a+1")).toEqual(["a", "b", "e"]))
  it("is case-insensitive and returns the focused root", () => {
    expect(selectNodes(nodes, "+C")?.root).toBe("c")
  })
  it("returns an empty selection for an unknown model", () => expect(sel("+zzz")).toEqual([]))
  it("returns null for plain text", () => expect(sel("orders")).toBeNull())
})
