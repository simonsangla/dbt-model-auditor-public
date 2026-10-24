import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { isPublicDemoOnly, publicModeGuard } from "../../lib/public-mode"

describe("isPublicDemoOnly", () => {
  it("is locked on Vercel by default", () => {
    expect(isPublicDemoOnly({ VERCEL: "1" })).toBe(true)
  })
  it("is open locally by default", () => {
    expect(isPublicDemoOnly({})).toBe(false)
  })
  it("can be forced on anywhere", () => {
    expect(isPublicDemoOnly({ PUBLIC_DEMO_ONLY: "true" })).toBe(true)
  })
  it("opts out only on the exact string false", () => {
    expect(isPublicDemoOnly({ VERCEL: "1", PUBLIC_DEMO_ONLY: "false" })).toBe(false)
    expect(isPublicDemoOnly({ VERCEL: "1", PUBLIC_DEMO_ONLY: "0" })).toBe(true)
    expect(isPublicDemoOnly({ VERCEL: "1", PUBLIC_DEMO_ONLY: "" })).toBe(true)
  })
})

describe("publicModeGuard", () => {
  it("returns a 403 with an error when locked", async () => {
    const res = publicModeGuard({ VERCEL: "1" })
    expect(res?.status).toBe(403)
    expect((await res!.json()).error).toMatch(/demo/i)
  })
  it("returns null when open", () => {
    expect(publicModeGuard({})).toBeNull()
  })
})

// Every route that can reach Snowflake or Cortex must call the guard first.
function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    return statSync(p).isDirectory() ? routeFiles(p) : name === "route.ts" ? [p] : []
  })
}

describe("every Snowflake-touching route is gated", () => {
  const root = path.resolve(__dirname, "../../app/api")
  const touching = routeFiles(root).filter((f) => {
    const src = readFileSync(f, "utf8")
    return /lib\/(snowflake|cortex|cortex-infra-auditor)"|api\.github\.com/.test(src)
  })

  it("finds the known routes", () => {
    expect(touching.length).toBeGreaterThanOrEqual(7)
  })

  for (const file of touching) {
    it(`${path.relative(root, file)} guards before any work`, () => {
      const src = readFileSync(file, "utf8")
      expect(src).toContain("publicModeGuard")
      const handler = src.search(/export async function (GET|POST)/)
      const guard = src.indexOf("publicModeGuard(", handler)
      const work = src.search(/querySnowflake\(|runCortexAudit\(|auditCortexInfra\(|runAudit\(|new URL\(|req\.json\(|parseConfigFromParams\(/)
      expect(guard).toBeGreaterThan(handler)
      expect(guard).toBeLessThan(work > handler ? work : Infinity)
    })
  }
})
