import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { FindingsTable } from "../../components/findings-table"
import type { AuditFinding } from "../../lib/audit-engine"

// Below 640px a table-stack row becomes a card and each cell prints data-label as its
// column name, so every labelled cell must carry exactly the header of its column.
function labelsByColumn(html: string) {
  const heads = [...html.matchAll(/<th[^>]*>(.*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim())
  const rows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].slice(1)
  return rows.map((r) =>
    [...r[1].matchAll(/<td([^>]*)>/g)].map((c, i) => ({ head: heads[i], label: /data-label="([^"]*)"/.exec(c[1])?.[1] })),
  )
}

const findings: AuditFinding[] = [
  { rule: "trust-question", severity: "error", message: "Missing metric", detail: "What is churn?", model: "churn" },
  { rule: "trust-question", severity: "warning", message: "ratio guard", model: undefined },
] as AuditFinding[]

describe("stacked record tables (phone)", () => {
  const html = renderToStaticMarkup(<FindingsTable findings={findings} />)

  it("findings table opts in to table-stack", () => {
    expect(html).toMatch(/<table[^>]*class="[^"]*table-stack/)
  })

  it("every cell under a named column carries that column name as data-label", () => {
    const cells = labelsByColumn(html).flat()
    expect(cells.length).toBe(10)
    cells.filter((c) => c.head).forEach((c) => expect(c.label).toBe(c.head))
  })

  it("keeps explicit table roles so display:block does not drop table semantics", () => {
    expect(html).toContain('role="table"')
    expect(html.match(/role="columnheader"/g)).toHaveLength(5)
    expect(html.match(/role="cell"/g)).toHaveLength(10)
  })

  it("trust page labels match their headers", () => {
    const src = readFileSync("app/trust/page.tsx", "utf8")
    const tables = src.split('<Table className="table-stack">').slice(1).map((t) => t.split("</Table>")[0])
    expect(tables).toHaveLength(2)
    for (const table of tables) {
      const heads = [...table.matchAll(/<TableHead>([^<]+)<\/TableHead>/g)].map((m) => m[1])
      const labels = [...table.matchAll(/<TableCell data-label="([^"]+)"/g)].map((m) => m[1])
      expect(heads.length).toBeGreaterThan(0)
      expect(labels).toEqual(heads)
    }
  })
})
