import { describe, expect, it } from "vitest"
import type { DbtManifest, DbtManifestNode } from "@/lib/manifest-parser"
import type { AuditFinding, ModelInfo } from "@/lib/audit-engine"
import {
  matchSourceLastAltered,
  pkEvidence,
  ruleMissingPkTests,
  ruleSourceFreshnessMissing,
  ruleFanOut,
  ruleRootModel,
  ruleMultipleSourcesJoined,
  ruleStagingDependsOnStaging,
  ruleSharedColumnDescription,
  runManifestRules,
  joinRuntimeEvidence,
  withSharedColumnFindings,
  SHARED_COLUMN_RULE,
} from "@/lib/manifest-rules"
import { SHARED_MEANING_META_KEY } from "@/lib/column-semantics"
import { computeScore } from "@/lib/audit-engine"
import { REVENUE_VARIANCE_MANIFEST } from "@/lib/revenue-variance-sample"
import { SNAPSHOT_MANIFEST, replaySnapshot } from "@/lib/audit-snapshot"

function model(name: string, deps: string[] = []): DbtManifestNode {
  return { unique_id: `model.p.${name}`, name, resource_type: "model", depends_on: { nodes: deps } }
}
/** A model whose columns all carry the same description; `confirmed` sets meta.shared_meaning_confirmed on them. */
function documented(name: string, columns: string[], description: string, confirmed = false): DbtManifestNode {
  const meta = confirmed ? { [SHARED_MEANING_META_KEY]: true } : undefined
  return { ...model(name, ["source.p.raw.x"]), columns: Object.fromEntries(columns.map((c) => [c, { name: c, description, meta }])) }
}
function test(kind: string, on: string, column: string): DbtManifestNode {
  return {
    unique_id: `test.p.${kind}_${on}_${column}`,
    name: `${kind}_${on}_${column}`,
    resource_type: "test",
    depends_on: { nodes: [`model.p.${on}`] },
    attached_node: `model.p.${on}`,
    test_metadata: { name: kind, kwargs: { column_name: column } },
  }
}
function manifest(nodes: DbtManifestNode[], sources: DbtManifest["sources"] = {}): DbtManifest {
  return { nodes: Object.fromEntries(nodes.map((n) => [n.unique_id, n])), sources }
}
const rules = (fs: AuditFinding[]) => fs.map((f) => `${f.rule}:${f.model}`).sort()

describe("missing-pk-tests", () => {
  it("flags a model without unique + not_null on the same column", () => {
    const m = manifest([model("a"), test("unique", "a", "id"), test("not_null", "a", "other")])
    expect(rules(ruleMissingPkTests(m))).toEqual(["missing-pk-tests:a"])
  })
  it("passes a model with unique + not_null on one column", () => {
    const m = manifest([model("a"), test("unique", "a", "id"), test("not_null", "a", "id")])
    expect(ruleMissingPkTests(m)).toEqual([])
  })
})

describe("source-freshness-missing", () => {
  it("flags a source with no freshness or null counts", () => {
    const m = manifest([], {
      "source.p.raw.a": { unique_id: "source.p.raw.a", name: "a", source_name: "raw" },
      "source.p.raw.b": {
        unique_id: "source.p.raw.b", name: "b", source_name: "raw",
        freshness: { warn_after: { count: null, period: null }, error_after: { count: null, period: null } },
      },
    })
    expect(rules(ruleSourceFreshnessMissing(m))).toEqual(["source-freshness-missing:source:a", "source-freshness-missing:source:b"])
  })
  it("passes a source with warn_after declared", () => {
    const m = manifest([], {
      "source.p.raw.a": {
        unique_id: "source.p.raw.a", name: "a", source_name: "raw",
        freshness: { warn_after: { count: 12, period: "hour" }, error_after: { count: null, period: null } },
      },
    })
    expect(ruleSourceFreshnessMissing(m)).toEqual([])
  })
  it("joins the declared freshness to the warehouse LAST_ALTERED when the table was queried", () => {
    const m = manifest([], { "source.p.raw.a": { unique_id: "source.p.raw.a", name: "a", source_name: "raw" } })
    const models = [{ name: "A", lastAltered: "2026-09-26T20:00:00.000Z" } as ModelInfo]
    const [f] = ruleSourceFreshnessMissing(m, models)
    expect(f.message).toContain("none declared")
    expect(f.message).toContain("2026-09-26")
    const [g] = ruleSourceFreshnessMissing(m)
    expect(g.message).toContain("not queried")
  })
})

describe("source to warehouse match", () => {
  it("matches case-insensitively on identifier or name", () => {
    const models = [{ name: "RAW_PAYMENTS", lastAltered: "2026-09-26T20:00:00.000Z" } as ModelInfo]
    expect(matchSourceLastAltered({ name: "raw_payments" }, models)).toBe("2026-09-26T20:00:00.000Z")
    expect(matchSourceLastAltered({ name: "payments", identifier: "Raw_Payments" }, models)).toBe("2026-09-26T20:00:00.000Z")
    expect(matchSourceLastAltered({ name: "orders" }, models)).toBeUndefined()
  })
  it("jaffle replay joins raw_payments to LAST_ALTERED", async () => {
    const snap = await replaySnapshot()
    const f = ruleSourceFreshnessMissing(SNAPSHOT_MANIFEST, snap.models).find((x) => x.model === "source:raw_payments")
    expect(f?.message).toMatch(/none declared; actual LAST_ALTERED \S+/)
  })
})

describe("pk evidence text", () => {
  it("renders human text", () => {
    expect(pkEvidence([], [])).toBe("Evidence: no unique or not_null test on any column.")
    expect(pkEvidence(["a", "b"], ["c"])).toBe("Evidence: unique on a, b; not_null on c. Missing the pair: a, b lack not_null; c lacks unique.")
  })
})

describe("fan-out", () => {
  it("flags a model with more than 3 direct model children", () => {
    const m = manifest([model("hub"), ...["a", "b", "c", "d"].map((n) => model(n, ["model.p.hub"]))])
    expect(rules(ruleFanOut(m))).toEqual(["fan-out:hub"])
  })
  it("passes a model with exactly 3 children", () => {
    const m = manifest([model("hub"), ...["a", "b", "c"].map((n) => model(n, ["model.p.hub"]))])
    expect(ruleFanOut(m)).toEqual([])
  })
})

describe("root-model", () => {
  it("flags a model with no dependencies", () => {
    expect(rules(ruleRootModel(manifest([model("lonely")])))).toEqual(["root-model:lonely"])
  })
  it("passes a model with a dependency", () => {
    expect(ruleRootModel(manifest([model("a", ["seed.p.s"])]))).toEqual([])
  })
})

describe("multiple-sources-joined", () => {
  it("flags a model reading two sources", () => {
    const m = manifest([model("a", ["source.p.raw.x", "source.p.raw.y"])])
    expect(rules(ruleMultipleSourcesJoined(m))).toEqual(["multiple-sources-joined:a"])
  })
  it("passes a model reading one source", () => {
    expect(ruleMultipleSourcesJoined(manifest([model("a", ["source.p.raw.x"])]))).toEqual([])
  })
})

describe("staging-depends-on-staging", () => {
  it("flags a staging model built on another staging model", () => {
    const m = manifest([model("stg_a"), model("stg_b", ["model.p.stg_a"])])
    expect(rules(ruleStagingDependsOnStaging(m))).toEqual(["staging-depends-on-staging:stg_b"])
  })
  it("passes a mart built on staging", () => {
    const m = manifest([model("stg_a"), model("fct_b", ["model.p.stg_a"])])
    expect(ruleStagingDependsOnStaging(m)).toEqual([])
  })
})

describe("shared-column-description: fails until confirmed in meta, never moves the score", () => {
  const D = "Unique identifier of the customer."
  it("fails with one warning per model when two models share name + description and nothing is confirmed", () => {
    const fs = ruleSharedColumnDescription(manifest([documented("fct_a", ["customer_id"], D), documented("dim_b", ["customer_id"], D)]))
    expect(rules(fs)).toEqual([`${SHARED_COLUMN_RULE}:dim_b`, `${SHARED_COLUMN_RULE}:fct_a`])
    for (const f of fs) {
      expect(f.severity).toBe("warning")
      expect(f.category).toBe("Data Integrity")
      expect(f.unscored).toBe(true)
      expect(f.message).toMatch(/not confirmed/)
      expect(f.detail).toContain(`meta.${SHARED_MEANING_META_KEY}: true`)
      expect(f.detail).toContain("pending: fct_a, dim_b")
      expect(f.fixSnippet).toContain(`${SHARED_MEANING_META_KEY}: true`)
      expect(f.fixSnippet).not.toMatch(/DROP/i)
      // Never asserts the columns are the same thing.
      expect(`${f.message} ${f.detail}`).not.toMatch(/duplicate|same meaning|are the same concept/i)
    }
    expect(fs[0].message).toContain('shares its name and description with dim_b')
  })
  it("still fails when only one of the two columns is confirmed", () => {
    const fs = ruleSharedColumnDescription(manifest([documented("fct_a", ["customer_id"], D, true), documented("dim_b", ["customer_id"], D)]))
    expect(fs).toHaveLength(2)
    expect(fs[0].detail).toContain("pending: dim_b")
  })
  it("passes once every column of the group is confirmed", () => {
    expect(ruleSharedColumnDescription(manifest([documented("fct_a", ["customer_id"], D, true), documented("dim_b", ["customer_id"], D, true)]))).toEqual([])
  })
  it("fails again on all three models when a new unconfirmed model joins a confirmed group", () => {
    const m = manifest([documented("fct_a", ["customer_id"], D, true), documented("dim_b", ["customer_id"], D, true), documented("rpt_c", ["customer_id"], D)])
    expect(rules(ruleSharedColumnDescription(m))).toEqual([`${SHARED_COLUMN_RULE}:dim_b`, `${SHARED_COLUMN_RULE}:fct_a`, `${SHARED_COLUMN_RULE}:rpt_c`])
  })
  it("does not fail for empty descriptions, a single model, or different texts", () => {
    expect(ruleSharedColumnDescription(manifest([documented("a", ["id"], ""), documented("b", ["id"], "")]))).toEqual([])
    expect(ruleSharedColumnDescription(manifest([documented("a", ["id"], D)]))).toEqual([])
    expect(ruleSharedColumnDescription(manifest([documented("a", ["id"], D), documented("b", ["id"], D + " (billing)")]))).toEqual([])
  })
  it("names the doc block in the evidence when the manifest carries one", () => {
    const m = { ...manifest([documented("a", ["customer_id"], D), documented("b", ["customer_id"], D)]), docs: { "doc.p.c": { name: "customer_id", block_contents: `${D}\n` } } }
    expect(ruleSharedColumnDescription(m)[0].detail).toContain('from doc block "customer_id"')
  })
  it("is part of runManifestRules and never changes the score", () => {
    const m = manifest([documented("fct_a", ["customer_id"], D), documented("dim_b", ["customer_id"], D)])
    const fs = runManifestRules(m)
    expect(fs.filter((f) => f.rule === SHARED_COLUMN_RULE)).toHaveLength(2)
    const scoredOnly = fs.filter((f) => f.rule !== SHARED_COLUMN_RULE)
    expect(computeScore(fs, 2)).toBe(computeScore(scoredOnly, 2))
  })
  it("withSharedColumnFindings appends the failures to an audit result, recounts totals and keeps the score", () => {
    const base = { totalModels: 2, errors: 0, warnings: 1, infos: 0, score: 85, checks: [], findings: [{ rule: "stale-model", severity: "warning" as const, message: "x", model: "FCT_A" }], models: [], config: { database: "D", schema: "S", warehouse: "W" }, runAt: "" }
    const m = manifest([documented("fct_a", ["customer_id"], D), documented("dim_b", ["customer_id"], D)])
    const out = withSharedColumnFindings(base, m)
    expect(out.findings).toHaveLength(3)
    expect(out.warnings).toBe(3)
    expect(out.score).toBe(85)
    expect(withSharedColumnFindings(base, null)).toBe(base)
    expect(withSharedColumnFindings(base, manifest([model("a")]))).toBe(base)
  })
  it("yields nothing on both shipped samples: their shared column names have empty or differing descriptions", () => {
    expect(ruleSharedColumnDescription(REVENUE_VARIANCE_MANIFEST)).toEqual([])
    expect(ruleSharedColumnDescription(SNAPSHOT_MANIFEST)).toEqual([])
  })
})

describe("every finding carries severity, message, evidence and a fix hint", () => {
  it("on the revenue sample", () => {
    for (const f of runManifestRules(REVENUE_VARIANCE_MANIFEST)) {
      expect(f.severity).toBeTruthy()
      expect(f.message).toBeTruthy()
      expect(f.detail).toBeTruthy()
      expect(f.fixSnippet).toBeTruthy()
    }
  })
})

describe("joinRuntimeEvidence (PK wedge)", () => {
  const runtime: AuditFinding = { rule: "no-primary-key", severity: "info", model: "A", message: "x" }
  const manifestPk: AuditFinding = { rule: "missing-pk-tests", severity: "warning", model: "a", message: "y" }
  it("merges missing-pk-tests and no-primary-key on the same model into one finding", () => {
    expect(rules(joinRuntimeEvidence([manifestPk], [runtime]))).toEqual(["pk-untested-undeclared:a"])
  })
  it("keeps both when they are on different models", () => {
    const other = { ...runtime, model: "B" }
    expect(rules(joinRuntimeEvidence([manifestPk], [other]))).toEqual(["missing-pk-tests:a", "no-primary-key:B"])
  })
})

describe("samples", () => {
  it("revenue sample yields at least 3 new findings, pinned", () => {
    const fs = runManifestRules(REVENUE_VARIANCE_MANIFEST)
    expect(fs.length).toBeGreaterThanOrEqual(3)
    expect(rules(fs)).toEqual([
      "missing-pk-tests:customer_ltv",
      "missing-pk-tests:fct_monthly_revenue",
      "missing-pk-tests:fct_revenue_variance",
      "missing-pk-tests:int_orders_enriched",
      "missing-pk-tests:legacy_margin",
      "missing-pk-tests:rpt_budget_gap",
      "missing-pk-tests:stg_budget",
      "source-freshness-missing:source:orders",
    ])
  })
  it("jaffle snapshot manifest, pinned", () => {
    expect(rules(runManifestRules(SNAPSHOT_MANIFEST))).toEqual([
      "missing-pk-tests:customer_ltv",
      "missing-pk-tests:stg_refunds",
      "missing-pk-tests:trust_orders",
      "source-freshness-missing:source:raw_payments",
      "staging-depends-on-staging:stg_refunds",
    ])
  })
  it("jaffle replay: runtime evidence joins the manifest rules", async () => {
    const run = await replaySnapshot()
    const joined = joinRuntimeEvidence(runManifestRules(SNAPSHOT_MANIFEST, run.models), run.findings)
    const fresh = joined.find((f) => f.rule === "source-freshness-missing")!
    expect(fresh.message).toContain("none declared")
    expect(fresh.message).toContain("LAST_ALTERED")
    const keys = joined.map((f) => `${f.rule}:${f.model}`)
    expect(keys).toContain("pk-untested-undeclared:customer_ltv")
    expect(keys).toContain("pk-untested-undeclared:stg_refunds")
    expect(keys).not.toContain("no-primary-key:CUSTOMER_LTV")
    expect(keys).not.toContain("no-primary-key:STG_REFUNDS")
  })
})
