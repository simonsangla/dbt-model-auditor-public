import { describe, it, expect, vi, afterEach } from "vitest"

async function load() {
  vi.resetModules()
  return (await import("../../next.config.mjs")).default
}

afterEach(() => vi.unstubAllEnvs())

describe("next.config output", () => {
  it("builds standalone for Docker/SPCS", async () => {
    vi.stubEnv("VERCEL", "")
    expect((await load()).output).toBe("standalone")
  })

  it("leaves output to Vercel's builder on Vercel (standalone breaks its file tracing)", async () => {
    vi.stubEnv("VERCEL", "1")
    expect((await load()).output).toBeUndefined()
  })
})
