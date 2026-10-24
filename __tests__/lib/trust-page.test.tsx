import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import TrustPage from "../../app/trust/page"
import { AUDIT_SECTIONS } from "../../components/audit-flow"

describe("/trust uses the shared audit flow (V11)", () => {
  const html = renderToStaticMarkup(<TrustPage />)

  it("renders the 5 audit sections in order", () => {
    const pos = AUDIT_SECTIONS.map((s) => html.indexOf(`<section id="${s.id}"`))
    pos.forEach((p) => expect(p).toBeGreaterThanOrEqual(0))
    expect([...pos].sort((a, b) => a - b)).toEqual(pos)
  })

  it("keeps the page title", () => {
    expect(html).toContain("Trust Sprint")
  })
})
