import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "fs"
import path from "path"
import { HeaderMeta, HeaderChip, HeaderText } from "../../components/audit-header-meta"

describe("audit header meta", () => {
  it("renders chips that inherit the header colour", () => {
    const html = renderToStaticMarkup(
      <HeaderMeta>
        <HeaderChip mono>A.B</HeaderChip>
        <HeaderChip variant="notice">Recorded run</HeaderChip>
        <HeaderText>line</HeaderText>
      </HeaderMeta>,
    )
    expect(html).toContain("border-current/40")
    expect(html).toContain("border-current/60")
    expect(html).not.toMatch(/text-(foreground|muted-foreground|primary|blue|amber)/)
  })

  // The description slot sits on the coloured band: page-level palette colours vanish there.
  for (const page of ["page.tsx", "cortex/page.tsx", "battery/page.tsx", "trust/page.tsx", "account-audit/page.tsx"]) {
    it(`${page} passes no palette colour into the header description`, () => {
      const src = readFileSync(path.resolve(__dirname, "../../app", page), "utf8")
      const i = src.indexOf("description=")
      const slot = src.slice(i, src.indexOf("inputs={", i))
      expect(slot).not.toMatch(/text-(muted-foreground|primary|foreground|blue-|amber-|slate-|emerald-|red-)/)
    })
  }
})
