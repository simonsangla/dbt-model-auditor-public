import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../../app/api/cortex-infra/route"

vi.mock("../../lib/snowflake", () => ({
  querySnowflake: vi.fn(),
}))

import { querySnowflake } from "../../lib/snowflake"

const url = "http://localhost:3000/api/cortex-infra"

describe("cortex-infra API route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("requires a configured target instead of falling back to sample data", async () => {
    const res = await GET(new Request(url))
    expect(res.status).toBe(400)
    expect(querySnowflake).not.toHaveBeenCalled()
  })

  it("returns 502 and no inventory when Snowflake cannot be reached", async () => {
    vi.mocked(querySnowflake).mockRejectedValue(new Error("No Snowflake credentials found"))
    const res = await GET(new Request(`${url}?db=NOPE&schema=NOPE&wh=NOPE`))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain("No Snowflake credentials found")
    expect(body.searchServices).toBeUndefined()
    expect(body.readinessScore).toBeUndefined()
  })

  it("returns only what SHOW reported, using metadata commands only", async () => {
    vi.mocked(querySnowflake).mockImplementation(async (sql: string) => {
      if (sql.startsWith("SHOW CORTEX SEARCH SERVICES")) {
        return [{ name: "DOCS_SEARCH", database_name: "DB", schema_name: "S", created_on: "2026-01-02", comment: "" }]
      }
      return []
    })
    const res = await GET(new Request(`${url}?db=DB&schema=S&wh=WH`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.searchServices).toEqual([
      { name: "DOCS_SEARCH", database: "DB", schema: "S", createdOn: "2026-01-02", comment: null },
    ])
    expect(body.semanticViews).toEqual([])
    for (const [sql] of vi.mocked(querySnowflake).mock.calls) {
      expect(sql).toMatch(/^SHOW /)
    }
  })
})
