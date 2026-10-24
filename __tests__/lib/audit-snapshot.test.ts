import { describe, it, expect } from "vitest"
import { replaySnapshot, snapshotQuery, SNAPSHOT_CONFIG, SNAPSHOT_EXPECTED, SNAPSHOT_MANIFEST, SNAPSHOT_SOURCE } from "../../lib/audit-snapshot"
import { auditDbtManifest } from "../../lib/manifest-parser"

describe("recorded audit snapshot (demo replay)", () => {
  it("replays through the current engine to exactly what was recorded", async () => {
    const r = await replaySnapshot()
    expect({
      totalModels: r.totalModels,
      errors: r.errors,
      warnings: r.warnings,
      infos: r.infos,
      score: r.score,
      checks: r.checks.map((c) => `${c.rule}:${c.status}`),
    }).toEqual(SNAPSHOT_EXPECTED)
    expect(r.totalModels).toBeGreaterThan(0)
    expect(r.runAt).toBe(SNAPSHOT_SOURCE.recordedAt)
  })

  it("is a demo config pointing at the recorded schema", () => {
    expect(SNAPSHOT_CONFIG.demo).toBe(true)
    expect(SNAPSHOT_CONFIG.schema).toBe(SNAPSHOT_SOURCE.schema)
  })

  it("a query the recording never saw fails instead of returning nothing", async () => {
    await expect(snapshotQuery("SELECT 1")).rejects.toThrow(/not in the recorded snapshot/)
  })

  it("every seeded defect is labelled and actually shows up in the replay", async () => {
    const r = await replaySnapshot()
    const s = auditDbtManifest(SNAPSHOT_MANIFEST)
    expect(SNAPSHOT_SOURCE.seeded.map((d) => d.split(":")[0])).toEqual(["stg_refunds", "customer_ltv"])
    expect(r.findings.some((f) => f.rule === "empty-model" && f.model === "STG_REFUNDS")).toBe(true)
    expect(s.directSourceViolations.map((v) => v.model)).toContain("customer_ltv")
  })
})
