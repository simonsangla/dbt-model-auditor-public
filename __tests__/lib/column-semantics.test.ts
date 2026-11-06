import { describe, expect, it } from "vitest"
import type { DbtManifest, DbtManifestColumn, DbtManifestNode } from "@/lib/manifest-parser"
import { SHARED_MEANING_META_KEY, isConfirmed, normalizeText, sharedColumnCoveragePct, sharedColumnGroups } from "@/lib/column-semantics"
import { REVENUE_VARIANCE_MANIFEST } from "@/lib/revenue-variance-sample"
import { SNAPSHOT_MANIFEST } from "@/lib/audit-snapshot"

const col = (name: string, description?: string, meta?: Record<string, unknown>): DbtManifestColumn => ({ name, description, meta })
function model(name: string, columns: DbtManifestColumn[], resource_type: DbtManifestNode["resource_type"] = "model"): DbtManifestNode {
  return { unique_id: `${resource_type}.p.${name}`, name, resource_type, columns: Object.fromEntries(columns.map((c) => [c.name, c])) }
}
const manifest = (nodes: DbtManifestNode[], docs: DbtManifest["docs"] = {}): DbtManifest => ({ nodes: Object.fromEntries(nodes.map((n) => [n.unique_id, n])), docs })
const CONFIRMED = { [SHARED_MEANING_META_KEY]: true }

describe("sharedColumnGroups", () => {
  it("groups two models sharing a name and an identical non-empty description", () => {
    const g = sharedColumnGroups(manifest([model("fct_a", [col("customer_id", "The customer.")]), model("dim_b", [col("customer_id", "The customer.")])]))
    expect(g).toEqual([{ column: "customer_id", description: "The customer.", models: ["fct_a", "dim_b"], confirmedBy: [], confirmed: false }])
  })
  it("matches the name case-insensitively and the description with whitespace collapsed", () => {
    const g = sharedColumnGroups(manifest([model("a", [col("CUSTOMER_ID", "The  customer.\n")]), model("b", [col("customer_id", "the customer.")])]))
    expect(g).toHaveLength(1)
    expect(g[0].column).toBe("customer_id")
  })
  it("never matches fuzzily: one differing word is a different description", () => {
    expect(sharedColumnGroups(manifest([model("a", [col("customer_id", "The customer.")]), model("b", [col("customer_id", "The customer (billing).")])]))).toEqual([])
  })
  it("never groups empty or missing descriptions", () => {
    expect(sharedColumnGroups(manifest([model("a", [col("id", "")]), model("b", [col("id", "   ")]), model("c", [col("id")])]))).toEqual([])
  })
  it("ignores a column present in a single model, a model listed twice and non-model nodes", () => {
    const seed = model("s", [col("customer_id", "The customer.")], "seed")
    const only = model("a", [col("customer_id", "The customer.")])
    expect(sharedColumnGroups(manifest([only, seed]))).toEqual([])
    expect(sharedColumnGroups(manifest([only]))).toEqual([])
  })
  it("splits one name with two different texts into two independent groups", () => {
    const g = sharedColumnGroups(manifest([
      model("a", [col("customer_id", "The customer.")]), model("b", [col("customer_id", "The customer.")]),
      model("c", [col("customer_id", "Billing account.")]), model("d", [col("customer_id", "Billing account.")]),
    ]))
    expect(g.map((x) => [x.description, x.models])).toEqual([["The customer.", ["a", "b"]], ["Billing account.", ["c", "d"]]])
  })
  it("attributes the text to a doc block when the manifest carries docs, as evidence only", () => {
    const nodes = [model("a", [col("customer_id", "The  customer.")]), model("b", [col("customer_id", "The customer.")])]
    const withDoc = sharedColumnGroups(manifest(nodes, { "doc.p.customer_id": { name: "customer_id", block_contents: "The customer.\n" } }))
    expect(withDoc[0].docBlock).toBe("customer_id")
    expect(withDoc[0].confirmed).toBe(false)
    expect(sharedColumnGroups(manifest(nodes))[0].docBlock).toBeUndefined()
  })
})

describe("confirmation in meta (the group fails until every member is confirmed)", () => {
  const a = model("a", [col("customer_id", "The customer.", CONFIRMED)])
  const b = model("b", [col("customer_id", "The customer.", CONFIRMED)])
  const c = model("c", [col("customer_id", "The customer.")])
  it("all members confirmed -> the group is confirmed", () => {
    const [g] = sharedColumnGroups(manifest([a, b]))
    expect(g.confirmed).toBe(true)
    expect(g.confirmedBy).toEqual(["a", "b"])
  })
  it("one member missing the flag -> not confirmed (partial confirmation is no confirmation)", () => {
    const [g] = sharedColumnGroups(manifest([a, c]))
    expect(g.confirmed).toBe(false)
    expect(g.confirmedBy).toEqual(["a"])
  })
  it("a new unconfirmed model re-opens a confirmed group", () => {
    expect(sharedColumnGroups(manifest([a, b]))[0].confirmed).toBe(true)
    expect(sharedColumnGroups(manifest([a, b, c]))[0].confirmed).toBe(false)
  })
  it("only the boolean true confirms", () => {
    expect(isConfirmed(col("x", "d", { [SHARED_MEANING_META_KEY]: true }))).toBe(true)
    for (const v of ["true", 1, "yes", false, null, undefined]) expect(isConfirmed(col("x", "d", { [SHARED_MEANING_META_KEY]: v }))).toBe(false)
    expect(isConfirmed(col("x", "d"))).toBe(false)
    expect(isConfirmed(undefined)).toBe(false)
  })
})

describe("coverage rate = confirmed groups over all groups", () => {
  const g = (confirmed: boolean) => ({ column: "x", description: "d", models: ["a", "b"], confirmedBy: [], confirmed })
  it("is null with no group, else a rounded percentage", () => {
    expect(sharedColumnCoveragePct([])).toBeNull()
    expect(sharedColumnCoveragePct([g(true), g(false), g(false)])).toBe(33)
    expect(sharedColumnCoveragePct([g(true), g(true)])).toBe(100)
    expect(sharedColumnCoveragePct([g(false)])).toBe(0)
  })
})

describe("helpers and samples", () => {
  it("normalizeText trims and collapses whitespace", () => {
    expect(normalizeText("  a \n\t b  ")).toBe("a b")
    expect(normalizeText(null)).toBe("")
  })
  it("both shipped samples have no group: their shared column names carry empty or differing descriptions", () => {
    expect(sharedColumnGroups(SNAPSHOT_MANIFEST)).toEqual([])
    expect(sharedColumnGroups(REVENUE_VARIANCE_MANIFEST)).toEqual([])
  })
})
