import { describe, it, expect, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { join } from "node:path"

vi.mock("next/navigation", () => ({ usePathname: () => "/trust" }))

import { AppSidebar, MobileNav } from "../../components/app-sidebar"

describe("app shell is responsive (B1, V11)", () => {
  it("layout uses the top navigation bar, not the sidebar", () => {
    const layout = readFileSync(join(__dirname, "../../app/layout.tsx"), "utf8")
    expect(layout).toContain("<MobileNav />")
    expect(layout).not.toContain("<AppSidebar />")
  })

  it("top nav shows at every width and, until the mode is known, only the public pages", () => {
    const html = renderToStaticMarkup(<MobileNav />)
    expect(html).not.toMatch(/<nav[^>]*class="[^"]*md:hidden/)
    for (const href of ["/", "/trust", "/account-audit"]) expect(html).toContain(`href="${href}"`)
    for (const href of ["/cortex", "/battery", "/docs", "/setup"]) expect(html).not.toContain(`href="${href}"`)
    expect(html).toMatch(/aria-current="page"[^>]*>[\s\S]*?Trust Sprin/)
  })

  it("links every page when the deploy is open", async () => {
    vi.resetModules()
    vi.doMock("../../lib/use-public-mode", () => ({ usePublicMode: () => false }))
    const { MobileNav: Open } = await import("../../components/app-sidebar")
    const html = renderToStaticMarkup(<Open />)
    for (const href of ["/", "/cortex", "/battery", "/trust", "/docs", "/setup", "/account-audit"]) {
      expect(html).toContain(`href="${href}"`)
    }
    vi.doUnmock("../../lib/use-public-mode")
  })
})
