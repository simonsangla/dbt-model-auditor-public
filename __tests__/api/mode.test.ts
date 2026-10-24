import { describe, it, expect, afterEach, vi } from "vitest"
import { GET } from "../../app/api/mode/route"

afterEach(() => vi.unstubAllEnvs())

describe("mode API route", () => {
  it("reports locked on Vercel", async () => {
    vi.stubEnv("VERCEL", "1")
    expect(await (await GET()).json()).toEqual({ publicDemoOnly: true })
  })
  it("reports open locally", async () => {
    vi.stubEnv("VERCEL", "")
    vi.stubEnv("PUBLIC_DEMO_ONLY", "")
    expect(await (await GET()).json()).toEqual({ publicDemoOnly: false })
  })
})
