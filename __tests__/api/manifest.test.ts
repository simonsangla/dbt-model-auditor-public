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
    expect(data.sharedColumnGroups).toEqual([])
    expect(data.sharedColumnCoveragePct).toBeNull()
  })

  it("returns the shared-column groups with their confirmation state and the coverage rate", async () => {
    const node = (name: string, confirmed: boolean) => ({
      unique_id: `model.p.${name}`, name, resource_type: "model",
      columns: { customer_id: { name: "customer_id", description: "The customer.", meta: confirmed ? { shared_meaning_confirmed: true } : {} } },
    })
    const req = new Request("http://localhost:3000/api/manifest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: { "model.p.fct_a": node("fct_a", true), "model.p.dim_b": node("dim_b", false) } }),
    })
    const data = await (await POST(req)).json()
    expect(data.sharedColumnGroups).toEqual([{ column: "customer_id", description: "The customer.", models: ["fct_a", "dim_b"], confirmedBy: ["fct_a"], confirmed: false }])
    expect(data.sharedColumnCoveragePct).toBe(0)
  })
})
