import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { validateDemoPack } from "../../lib/demo-pack"

const good = {
  app: "trust-sprint",
  audience: "Head of Data evaluating text-to-SQL",
  outcome: "Sees which business questions are safe before rollout",
  run: { command: "npm run dev -- -p 3107", url: "http://localhost:3107/trust" },
  data: { source: "lib/trust-sample.ts", synthetic: true },
  scenes: [{ id: "overview", route: "/trust", action: "open page", proof: "score and counts", caption: "One score for the domain" }],
}

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pack-"))
  mkdirSync(join(root, "app", "trust"), { recursive: true })
  writeFileSync(join(root, "app", "trust", "page.tsx"), "")
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

function writePack(pack: unknown, storyboard = "# Storyboard\n\nAudience and scenes.") {
  const dir = join(root, "demo-pack", "trust-sprint")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "pack.json"), JSON.stringify(pack))
  writeFileSync(join(dir, "STORYBOARD.md"), storyboard)
  return dir
}

describe("validateDemoPack (V9, V10)", () => {
  it("accepts a complete pack whose routes exist", () => {
    expect(validateDemoPack(writePack(good), root)).toEqual([])
  })

  it("rejects missing fields and a missing storyboard", () => {
    const dir = writePack({ app: "x" })
    rmSync(join(dir, "STORYBOARD.md"))
    const errors = validateDemoPack(dir, root).join(" ")
    expect(errors).toMatch(/STORYBOARD\.md/)
    expect(errors).toMatch(/audience/)
    expect(errors).toMatch(/scenes/)
  })

  it("rejects placeholder text anywhere in the pack", () => {
    const errors = validateDemoPack(writePack({ ...good, outcome: "TODO later" }, "# Storyboard\n<AUDIENCE>"), root)
    expect(errors.join(" ")).toMatch(/placeholder/)
  })

  it("rejects a scene on a route the app does not have", () => {
    const errors = validateDemoPack(writePack({ ...good, scenes: [{ ...good.scenes[0], route: "/nowhere" }] }), root)
    expect(errors.join(" ")).toMatch(/\/nowhere/)
  })

  it("rejects unlabelled data (V10: demos run on labelled data)", () => {
    const errors = validateDemoPack(writePack({ ...good, data: { ...good.data, synthetic: false } }), root)
    expect(errors.join(" ")).toMatch(/labelled/)
  })

  it("accepts a recorded real run on public data (V10)", () => {
    const errors = validateDemoPack(writePack({ ...good, data: { source: "lib/trust-sample.json", recorded: true } }), root)
    expect(errors).toEqual([])
  })
})
