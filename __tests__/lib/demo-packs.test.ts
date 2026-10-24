import { describe, it, expect } from "vitest"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { validateDemoPack } from "../../lib/demo-pack"

const ROOT = join(__dirname, "../..")
const PACKS = join(ROOT, "demo-pack")
const packs = existsSync(PACKS) ? readdirSync(PACKS).filter((d) => !d.startsWith("_")) : []

describe("committed demo packs (V9, V10)", () => {
  it("ships the Trust Sprint pack", () => {
    expect(packs).toContain("trust-sprint")
  })

  it.each(packs)("%s is complete and valid", (pack) => {
    expect(validateDemoPack(join(PACKS, pack), ROOT)).toEqual([])
  })
})
