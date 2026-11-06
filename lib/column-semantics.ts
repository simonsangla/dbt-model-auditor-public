// Columns that share a name AND a description across several dbt models.
//
// Same name and same text do not prove the same business meaning or grain: a
// "customer_id" that is the billing account in one mart and the shopper in
// another joins silently into wrong, missing or fanned-out rows. This module
// never decides that such columns mean the same thing. It groups them, reports
// the evidence, and treats a group as confirmed only when a human has written
// `meta: { shared_meaning_confirmed: true }` on EVERY column of the group.
// Pure functions: manifest in, groups out. No fuzzy matching, ever.
import type { DbtManifest, DbtManifestColumn } from "./manifest-parser"

/** Column-level meta key a human sets once the shared meaning has been checked. */
export const SHARED_MEANING_META_KEY = "shared_meaning_confirmed"

export interface SharedColumnGroup {
  /** Column name, lower-cased (dbt lower-cases, Snowflake upper-cases). */
  column: string
  /** Description as first seen, whitespace collapsed. Never empty. */
  description: string
  /** Distinct models carrying the column with this description, in manifest order. */
  models: string[]
  /** Models whose column carries `meta.shared_meaning_confirmed: true` (strict boolean). */
  confirmedBy: string[]
  /** True only when every model of the group is confirmed. A new unconfirmed model re-opens the group. */
  confirmed: boolean
  /** Name of the doc block whose contents equal the description, when the manifest carries docs. Evidence only. */
  docBlock?: string
}

/** Trim and collapse whitespace; the comparison key is additionally lower-cased. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim()
}

/** Strict: only the boolean `true` confirms; "true", 1 or "yes" do not. */
export function isConfirmed(col: DbtManifestColumn | undefined): boolean {
  return col?.meta?.[SHARED_MEANING_META_KEY] === true
}

function docBlockFor(m: DbtManifest, descriptionKey: string): string | undefined {
  for (const d of Object.values(m.docs ?? {})) {
    if (normalizeText(d.block_contents).toLowerCase() === descriptionKey) return d.name
  }
  return undefined
}

/**
 * Groups model columns by (name, description). Empty descriptions never group:
 * two undocumented columns are a documentation gap, not a shared description.
 * Only `resource_type === "model"` nodes are read.
 */
export function sharedColumnGroups(m: DbtManifest): SharedColumnGroup[] {
  const groups = new Map<string, { description: string; members: Map<string, DbtManifestColumn> }>()
  for (const n of Object.values(m.nodes ?? {})) {
    if (n.resource_type !== "model") continue
    for (const col of Object.values(n.columns ?? {})) {
      const description = normalizeText(col.description)
      if (!description) continue
      const name = normalizeText(col.name).toLowerCase()
      if (!name) continue
      const key = `${name}\u0000${description.toLowerCase()}`
      let g = groups.get(key)
      if (!g) {
        g = { description, members: new Map() }
        groups.set(key, g)
      }
      if (!g.members.has(n.name)) g.members.set(n.name, col)
    }
  }
  const out: SharedColumnGroup[] = []
  for (const [key, g] of groups) {
    if (g.members.size < 2) continue
    const column = key.split("\u0000")[0]
    const models = [...g.members.keys()]
    const confirmedBy = models.filter((name) => isConfirmed(g.members.get(name)))
    const docBlock = docBlockFor(m, key.split("\u0000")[1])
    out.push({
      column,
      description: g.description,
      models,
      confirmedBy,
      confirmed: confirmedBy.length === models.length,
      ...(docBlock ? { docBlock } : {}),
    })
  }
  return out
}

/** Coverage rate: confirmed groups over all groups, in percent. null when there is no group to confirm. */
export function sharedColumnCoveragePct(groups: SharedColumnGroup[]): number | null {
  if (groups.length === 0) return null
  return Math.round((groups.filter((g) => g.confirmed).length / groups.length) * 100)
}
