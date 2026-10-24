import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET } from "../../app/api/audit/route"

vi.mock("../../lib/snowflake", () => ({
  querySnowflake: vi.fn(),
}))

import { querySnowflake } from "../../lib/snowflake"

describe("audit API route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 400 when missing parameters", async () => {
    const req = new Request("http://localhost:3000/api/audit?db=TEST")
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it("runs audit successfully with valid parameters", async () => {
    vi.mocked(querySnowflake).mockImplementation(async (sql: string) => {
      if (sql.includes(".TABLES") && sql.includes("CLUSTERING_KEY")) {
        return [
          {
            TABLE_NAME: "FCT_ORDERS",
            TABLE_CATALOG: "DB",
            TABLE_SCHEMA: "SCHEMA",
            TABLE_TYPE: "BASE TABLE",
            ROW_COUNT: 100,
            BYTES: 1024,
            CREATED: "2026-01-01",
            LAST_ALTERED: "2026-09-01",
            CLUSTERING_KEY: null,
          },
        ]
      }
      return []
    })

    const req = new Request("http://localhost:3000/api/audit?db=DB&schema=SCHEMA&wh=WH")
    const res = await GET(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.totalModels).toBe(1)
    expect(data.score).toBeGreaterThan(0)
  })

  it("returns 502 with the reason, never a score, when Snowflake cannot be reached", async () => {
    vi.mocked(querySnowflake).mockRejectedValue(new Error("No Snowflake credentials found"))
    const res = await GET(new Request("http://localhost:3000/api/audit?db=DB&schema=SCHEMA&wh=WH"))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toContain("No Snowflake credentials found")
    expect(body.score).toBeUndefined()
  })

  it("rejects a schema name that is not a plain identifier before querying", async () => {
    const res = await GET(new Request("http://localhost:3000/api/audit?db=DB&schema=" + encodeURIComponent("X\\' OR 1=1") + "&wh=WH"))
    expect(res.status).toBe(400)
    expect(querySnowflake).not.toHaveBeenCalled()
  })
})
