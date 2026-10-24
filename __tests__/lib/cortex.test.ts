import { describe, it, expect, vi } from "vitest"
import { runCortexAudit } from "../../lib/cortex"

const request = {
  modelName: "fct_orders",
  sqlCode: "SELECT order_id FROM stg_orders WHERE note = 'it''s'",
  task: "document" as const,
}

describe("runCortexAudit", () => {
  it("passes model and prompt as bind variables, never in the SQL text", async () => {
    const query = vi.fn().mockResolvedValue([{ AI_OUTPUT: "version: 2" }])
    const res = await runCortexAudit(request, query)

    const [sql, opts] = query.mock.calls[0]
    expect(sql).toBe("SELECT SNOWFLAKE.CORTEX.COMPLETE(?, ?) AS AI_OUTPUT")
    expect(opts.binds[0]).toBe("mistral-large2")
    expect(opts.binds[1]).toContain(request.sqlCode)
    expect(res.output).toBe("version: 2")
    expect(res.modelUsed).toBe("Snowflake Cortex (mistral-large2)")
  })

  it("rejects a model outside the allowlist before any query", async () => {
    const query = vi.fn()
    await expect(
      runCortexAudit({ ...request, cortexModel: "x', 'y') --" as never }, query),
    ).rejects.toThrow(/Unsupported Cortex model/)
    expect(query).not.toHaveBeenCalled()
  })

  it("fails instead of returning a canned answer when Cortex is unreachable", async () => {
    const query = vi.fn().mockRejectedValue(new Error("No Snowflake credentials found"))
    await expect(runCortexAudit(request, query)).rejects.toThrow(/No Snowflake credentials/)
  })

  it("fails on an empty Cortex response", async () => {
    const query = vi.fn().mockResolvedValue([{ AI_OUTPUT: "  " }])
    await expect(runCortexAudit(request, query)).rejects.toThrow(/empty response/)
  })
})
