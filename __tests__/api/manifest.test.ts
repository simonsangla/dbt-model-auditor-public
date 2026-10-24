import { describe, it, expect } from "vitest"
import { POST } from "../../app/api/manifest/route"

describe("manifest API route", () => {
  it("returns 400 when invalid payload is passed", async () => {
    const req = new Request("http://localhost:3000/api/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("evaluates manifest payload and returns summary", async () => {
    const req = new Request("http://localhost:3000/api/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodes: {
          "model.p.stg_users": {
            unique_id: "model.p.stg_users",
            name: "stg_users",
            resource_type: "model",
            description: "Users staging",
          },
        },
      }),
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.totalModels).toBe(1)
    expect(data.docCoveragePct).toBe(100)
  })
})
