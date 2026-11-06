import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { SharedColumnsBlock } from "../../components/manifest-panel"
import type { SharedColumnGroup } from "../../lib/column-semantics"

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

describe("manifest panel: shared columns to confirm", () => {
  const pending: SharedColumnGroup = { column: "customer_id", description: "The customer.", models: ["fct_a", "dim_b", "rpt_c"], confirmedBy: ["fct_a"], confirmed: false, docBlock: "customer_id" }
  const done: SharedColumnGroup = { column: "amount", description: "Order amount.", models: ["fct_a", "rpt_c"], confirmedBy: ["fct_a", "rpt_c"], confirmed: true }

  it("shows the coverage rate as confirmed groups over all groups and lists the unconfirmed group as FAILED", () => {
    const html = renderToStaticMarkup(<SharedColumnsBlock groups={[pending, done]} coveragePct={50} />)
    const t = text(html)
    expect(t).toContain("50%")
    expect(t).toContain("1/2 groups confirmed in meta")
    expect(t).toContain("FAILED until confirmed: 1 shared-column group")
    expect(t).toContain("does not change the score")
    expect(t).toMatch(/customer_id in fct_a \(confirmed\) , dim_b , rpt_c/)
    expect(t).toContain("text from doc block customer_id")
    expect(t).toContain("meta.shared_meaning_confirmed: true")
    expect(t).not.toContain("amount")
    expect(html).toContain('data-testid="shared-columns-to-confirm"')
  })

  it("renders n/a and no list when no column shares name and description", () => {
    const html = renderToStaticMarkup(<SharedColumnsBlock groups={[]} coveragePct={null} />)
    expect(text(html)).toContain("n/a")
    expect(text(html)).toContain("no column shares name + description")
    expect(html).not.toContain("shared-columns-to-confirm")
  })

  it("renders 100% without a failure when every group is confirmed", () => {
    const html = renderToStaticMarkup(<SharedColumnsBlock groups={[done]} coveragePct={100} />)
    expect(text(html)).toContain("100%")
    expect(html).not.toContain("FAILED")
  })
})
