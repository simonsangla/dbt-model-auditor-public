import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// the brand site src/styles/globals.css (light) - the brand source of truth (SPEC V8).
const SITE_TOKENS: Record<string, string> = {
  "--radius": "0.5rem",
  "--background": "#ffffff",
  "--foreground": "#101c2b",
  "--card": "#ffffff",
  "--card-foreground": "#101c2b",
  "--primary": "#2f6b4f",
  "--primary-foreground": "#ffffff",
  "--secondary": "#f2f5f8",
  "--muted": "#f2f5f8",
  "--muted-foreground": "#4a5768",
  "--accent": "#f2f5f8",
  "--destructive": "#9e3b2e",
  "--border": "#d9e0e8",
  "--input": "#d9e0e8",
  "--ring": "#2f6b4f",
}

function rootBlock(css: string): string {
  const start = css.indexOf(":root {")
  expect(start).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf("}", start))
}

describe("light theme matches the brand site (V8)", () => {
  const root = rootBlock(readFileSync(join(__dirname, "../../app/globals.css"), "utf8"))
  it.each(Object.entries(SITE_TOKENS))("%s = %s", (name, value) => {
    const m = root.match(new RegExp(`${name}:\\s*([^;]+);`))
    expect(m?.[1].trim()).toBe(value)
  })
})

describe("default theme is light (V8)", () => {
  it("ThemeProvider starts in light mode, not system", () => {
    const src = readFileSync(join(__dirname, "../../components/theme-provider.tsx"), "utf8")
    expect(src).toMatch(/useState<Theme>\("light"\)/)
  })
})
