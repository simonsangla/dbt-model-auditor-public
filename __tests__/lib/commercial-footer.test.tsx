import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { CommercialFooter, TRUST_SPRINT_URL } from "../../components/commercial-bridge"

describe("CommercialFooter offers", () => {
  const html = renderToStaticMarkup(<CommercialFooter />)
  it("keeps the project link and drops the free audit", () => {
    expect(html).toContain(`href="${TRUST_SPRINT_URL}"`)
    expect(html).toContain("Project page")
    expect(html).not.toMatch(/free read-only/i)
  })
  it("makes no guarantee", () => {
    expect(html.toLowerCase()).not.toMatch(/guarantee/)
  })
})
