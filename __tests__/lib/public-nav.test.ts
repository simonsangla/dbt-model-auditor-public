import { describe, it, expect } from "vitest"
import { NextRequest } from "next/server"
import { PUBLIC_PATHS, isPublicPath } from "../../lib/public-nav"
import { proxy } from "../../proxy"

describe("public nav", () => {
  it("exposes exactly the four demo pages", () => {
    expect([...PUBLIC_PATHS]).toEqual(["/", "/lineage", "/trust", "/account-audit"])
  })
  it("matches by exact path", () => {
    expect(isPublicPath("/trust")).toBe(true)
    expect(isPublicPath("/cortex")).toBe(false)
    expect(isPublicPath("/trust/x")).toBe(false)
  })
})

describe("proxy", () => {
  const req = (p: string) => new NextRequest(`http://localhost:3000${p}`)
  it("redirects hidden pages to / when locked", () => {
    process.env.VERCEL = "1"
    for (const p of ["/cortex", "/battery", "/docs", "/setup"]) {
      const res = proxy(req(p))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get("location")!).pathname).toBe("/")
    }
    delete process.env.VERCEL
  })
  it("passes hidden pages through when open", () => {
    delete process.env.VERCEL
    expect(proxy(req("/cortex")).headers.get("location")).toBeNull()
  })
})
