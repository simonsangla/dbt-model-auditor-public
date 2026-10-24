import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../../app/api/github/route"

describe("github API route", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns empty result when no repo param is given", async () => {
    const req = new Request("http://localhost:3000/api/github")
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.repo).toBeNull()
    expect(data.files).toEqual([])
  })

  it("fetches repo files and counts them by type", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/contents/models")) {
        return {
          ok: true,
          json: async () => [
            { name: "stg_orders.sql", path: "models/stg_orders.sql", type: "file" },
            { name: "schema.yml", path: "models/schema.yml", type: "file" },
          ],
        }
      }
      if (url.includes("/contents/tests")) {
        return {
          ok: true,
          json: async () => [
            { name: "assert_positive.sql", path: "tests/assert_positive.sql", type: "file" },
          ],
        }
      }
      return { ok: false, status: 404 }
    })
    vi.stubGlobal("fetch", fetchMock)

    const req = new Request("http://localhost:3000/api/github?repo=octocat/dbt-sample")
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.summary.models).toBe(1)
    expect(data.summary.tests).toBe(1)
    expect(data.summary.schemas).toBe(1)
    expect(data.summary.testCoverage).toBeUndefined()
  })

  it("reports a GitHub failure instead of zero files", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    const res = await GET(new Request("http://localhost:3000/api/github?repo=octocat/dbt-sample"))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain("403")
  })

  it("rejects a repo value that is not owner/name", async () => {
    const res = await GET(new Request("http://localhost:3000/api/github?repo=" + encodeURIComponent("../../user")))
    expect(res.status).toBe(400)
  })
})
