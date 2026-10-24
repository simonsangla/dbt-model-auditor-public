import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

// Shipped copy must not promise more than the product can prove.
const BANNED = [/100%\s*in-VPC/i, /nothing leaves/i, /never sees a row/i, /clear InfoSec review in one pass/i]
const ROOTS = ["app", "components", "lib"]

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return files(p)
    return /\.(tsx?|mdx?)$/.test(p) ? [p] : []
  })
}

describe("no universal guarantees in shipped copy", () => {
  const all = ROOTS.flatMap((r) => files(join(__dirname, "..", "..", r)))
  it("scans a non-empty file set", () => {
    expect(all.length).toBeGreaterThan(10)
  })
  it("contains none of the banned phrases", () => {
    const hits = all.flatMap((f) => {
      const text = readFileSync(f, "utf8")
      return BANNED.filter((re) => re.test(text)).map((re) => `${f}: ${re}`)
    })
    expect(hits).toEqual([])
  })
})
