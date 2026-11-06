import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// The gate runs the real lib/column-semantics.ts through Node's native TypeScript loading:
// one command, exit 1 while a group is unconfirmed, 0 once every group is confirmed.
const root = join(__dirname, "..", "..")
const run = (...args: string[]) =>
  spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", join(root, "scripts", "shared-columns-gate.mjs"), ...args], { encoding: "utf8" })

const col = (confirmed: boolean) => ({ name: "customer_id", description: "The customer.", meta: confirmed ? { shared_meaning_confirmed: true } : {} })
const model = (name: string, confirmed: boolean) => ({ unique_id: `model.p.${name}`, name, resource_type: "model", columns: { customer_id: col(confirmed) } })
const dir = mkdtempSync(join(tmpdir(), "shared-columns-gate-"))
const write = (name: string, body: unknown) => {
  const p = join(dir, name)
  writeFileSync(p, JSON.stringify(body))
  return p
}
const pending = write("pending.json", { nodes: { a: model("fct_a", true), b: model("dim_b", false) } })
const confirmed = write("confirmed.json", { nodes: { a: model("fct_a", true), b: model("dim_b", true) } })
const none = write("none.json", { nodes: { a: model("fct_a", false) } })

describe("scripts/shared-columns-gate.mjs", () => {
  it("stops (exit 1) on a manifest with an unconfirmed group and names the pending model", () => {
    const r = run(pending)
    expect(r.status).toBe(1)
    expect(r.stdout).toContain("PENDING customer_id: fct_a (confirmed), dim_b")
    expect(r.stdout).toContain("FAILED: 1 group(s) not confirmed")
    expect(r.stdout).toContain("coverage 0%")
  })
  it("passes (exit 0) once every group is confirmed", () => {
    const r = run(confirmed)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain("coverage 100%")
    expect(r.stdout).toContain("PASSED: every shared-column group is confirmed")
  })
  it("passes (exit 0) when no column shares a name and a description", () => {
    const r = run(none)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain("PASSED: no column shares")
  })
  it("reads a recorded snapshot that wraps the manifest, and reports usage errors with exit 2", () => {
    expect(run(join(root, "lib", "audit-snapshot.json")).status).toBe(0)
    expect(run().status).toBe(2)
    expect(run(join(dir, "missing.json")).status).toBe(2)
    expect(run(write("not-a-manifest.json", { hello: 1 })).status).toBe(2)
  })
})
