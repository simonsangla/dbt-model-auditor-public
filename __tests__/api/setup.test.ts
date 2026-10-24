import { describe, it, expect, vi, beforeEach } from "vitest"
import { GET as getWarehouses } from "../../app/api/setup/warehouses/route"
import { GET as getDatabases } from "../../app/api/setup/databases/route"
import { GET as getSchemas } from "../../app/api/setup/schemas/route"

vi.mock("../../lib/snowflake", () => ({
  querySnowflake: vi.fn(),
}))

import { querySnowflake } from "../../lib/snowflake"

describe("setup API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("lists warehouses from SHOW WAREHOUSES", async () => {
    vi.mocked(querySnowflake).mockResolvedValueOnce([
      { name: "COMPUTE_WH", state: "STARTED", size: "X-Small" },
    ])

    const res = await getWarehouses()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.warehouses).toEqual([
      { name: "COMPUTE_WH", state: "STARTED", size: "X-Small" },
    ])
  })

  it("lists databases excluding SNOWFLAKE system db", async () => {
    vi.mocked(querySnowflake).mockResolvedValueOnce([
      { name: "ANALYTICS_DB", kind: "STANDARD", comment: "" },
      { name: "SNOWFLAKE", kind: "IMPORTED DATABASE", comment: "" },
    ])

    const res = await getDatabases()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.databases).toEqual([
      { name: "ANALYTICS_DB", kind: "STANDARD", comment: "" },
    ])
  })

  it("lists schemas for a given valid database name", async () => {
    vi.mocked(querySnowflake).mockResolvedValueOnce([
      { name: "PUBLIC", comment: "" },
      { name: "ANALYTICS", comment: "" },
      { name: "INFORMATION_SCHEMA", comment: "" },
    ])

    const req = new Request("http://localhost:3000/api/setup/schemas?db=ANALYTICS_DB")
    const res = await getSchemas(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.schemas).toEqual([
      { name: "PUBLIC", comment: "" },
      { name: "ANALYTICS", comment: "" },
    ])
  })

  it("rejects invalid database names", async () => {
    const req = new Request("http://localhost:3000/api/setup/schemas?db=INVALID;DROP")
    const res = await getSchemas(req)
    expect(res.status).toBe(400)
  })
})
