import { describe, it, expect } from "vitest"
import { latestOnly } from "../../lib/latest-request"

describe("latestOnly", () => {
  it("only the most recent request may apply its result", () => {
    const guard = latestOnly()
    const demo = guard.start()
    const upload = guard.start()
    expect(guard.isLatest(demo)).toBe(false)
    expect(guard.isLatest(upload)).toBe(true)
  })

  it("a slow first request cannot overwrite a newer one", async () => {
    const guard = latestOnly()
    let shown = ""
    const run = async (label: string, delay: number) => {
      const t = guard.start()
      await new Promise((r) => setTimeout(r, delay))
      if (guard.isLatest(t)) shown = label
    }
    await Promise.all([run("demo", 30), run("upload", 5)])
    expect(shown).toBe("upload")
  })
})
