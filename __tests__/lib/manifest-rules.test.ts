import { describe, expect, it } from "vitest"
import type { DbtManifest, DbtManifestNode } from "@/lib/manifest-parser"
import type { AuditFinding, ModelInfo } from "@/lib/audit-engine"
import {
  matchSourceLastAltered,
  pkEvidence,
  ruleMissingPkTests,
  ruleSourceFreshnessMissing,
  ruleFanOut,
  modelChildren,
  ruleRootModel,
  ruleMultipleSourcesJoined,
  ruleStagingDependsOnStaging,
  ruleSharedColumnDescription,
  ruleChainedViews,
  CHAINED_VIEWS_RULE,
  CHAINED_VIEWS_THRESHOLD,
  runManifestRules,
  joinRuntimeEvidence,
  withSharedColumnFindings,
  SHARED_COLUMN_RULE,
} from "@/lib/manifest-rules"
import { SHARED_MEANING_META_KEY } from "@/lib/column-semantics"
import { computeScore } from "@/lib/audit-engine"
import { REVENUE_VARIANCE_MANIFEST } from "@/lib/revenue-variance-sample"
import { SNAPSHOT_EXPECTED, SNAPSHOT_MANIFEST, replaySnapshot } from "@/lib/audit-snapshot"

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

// Frozen before the dependency logic moved into a shared helper: these pin the complete
// ruleFanOut output (text, child order, finding order), not just which models are flagged.
describe("fan-out: frozen output", () => {
  const fanOut = (hub: string, kids: string[]): AuditFinding => ({
    rule: "fan-out",
    severity: "warning",
    category: "dbt Architecture",
    model: hub,
    message: `Model "${hub}" has ${kids.length} direct children (threshold 3)`,
    detail: `Evidence: children ${kids.join(", ")}.`,
    fixSnippet: "-- Move shared logic into one downstream intermediate model and point the children at it.",
  })

  it("renders the full finding, children listed in manifest order", () => {
    const m = manifest([model("hub"), ...["d", "b", "a", "c"].map((n) => model(n, ["model.p.hub"]))])
    expect(ruleFanOut(m)).toEqual([fanOut("hub", ["d", "b", "a", "c"])])
  })
  it("orders findings by manifest order of the flagged models", () => {
    const m = manifest([
      model("hub_b"),
      model("hub_a"),
      ...["a1", "a2", "a3", "a4"].map((n) => model(n, ["model.p.hub_a"])),
      ...["b1", "b2", "b3", "b4", "b5"].map((n) => model(n, ["model.p.hub_b"])),
    ])
    expect(ruleFanOut(m)).toEqual([fanOut("hub_b", ["b1", "b2", "b3", "b4", "b5"]), fanOut("hub_a", ["a1", "a2", "a3", "a4"])])
  })
  it("counts a child once per model parent it lists, alongside source and seed parents", () => {
    const m = manifest([model("hub"), ...["a", "b", "c", "d"].map((n) => model(n, ["source.p.raw.x", "model.p.hub", "seed.p.s"]))])
    expect(ruleFanOut(m)).toEqual([fanOut("hub", ["a", "b", "c", "d"])])
  })
  it("keeps a repeated dependency as listed (dbt dedupes depends_on; hand-made manifests may not)", () => {
    const m = manifest([model("hub"), model("a", ["model.p.hub", "model.p.hub"]), model("b", ["model.p.hub", "model.p.hub"])])
    expect(ruleFanOut(m)).toEqual([fanOut("hub", ["a", "a", "b", "b"])])
  })
  it("ignores non-model children and non-model parents", () => {
    const m = manifest([
      model("hub"),
      ...["a", "b", "c"].map((n) => model(n, ["model.p.hub"])),
      ...["id", "code", "ts", "amount"].map((c) => test("not_null", "hub", c)),
      ...["w", "x", "y", "z"].map((n) => model(n, ["source.p.raw.x", "seed.p.s", "snapshot.p.snap"])),
    ])
    expect(ruleFanOut(m)).toEqual([])
  })
  it("never reports a parent that is not a model of the manifest", () => {
    const m = manifest(["a", "b", "c", "d"].map((n) => model(n, ["model.other.ghost"])))
    expect(ruleFanOut(m)).toEqual([])
  })
  it("yields nothing on both shipped samples", () => {
    expect(ruleFanOut(REVENUE_VARIANCE_MANIFEST)).toEqual([])
    expect(ruleFanOut(SNAPSHOT_MANIFEST)).toEqual([])
  })
})

describe("modelChildren (shared by the dependency-graph rules)", () => {
  it("keys model parents only, keeps manifest order and repeated dependencies, returns the child nodes", () => {
    const m = manifest([
      model("hub"),
      model("b", ["model.p.hub", "source.p.raw.x"]),
      model("a", ["model.p.hub", "model.p.hub", "seed.p.s", "snapshot.p.snap"]),
      model("c", ["model.other.ghost"]),
      test("unique", "hub", "id"),
    ])
    const children = modelChildren(m)
    expect([...children.keys()]).toEqual(["model.p.hub", "model.other.ghost"])
    expect(children.get("model.p.hub")!.map((n) => n.name)).toEqual(["b", "a", "a"])
    expect(children.get("model.p.hub")![0]).toBe(m.nodes["model.p.b"])
    expect(children.get("model.other.ghost")!.map((n) => n.name)).toEqual(["c"])
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

describe("chained-views", () => {
  /** A model with an explicit materialization, depending on the given models of package p. */
  function mat(name: string, materialized: string | undefined, parents: string[] = []): DbtManifestNode {
    return { ...model(name, parents.map((p) => `model.p.${p}`)), ...(materialized === undefined ? {} : { config: { materialized } }) }
  }
  /** A straight chain: names[i] depends on names[i - 1]; the head depends on `head` if given. */
  function chain(names: string[], materialized = "view", head: string[] = []): DbtManifestNode[] {
    return names.map((n, i) => ({ ...mat(n, materialized), depends_on: { nodes: i === 0 ? head : [`model.p.${names[i - 1]}`] } }))
  }
  const ends = (m: DbtManifest) => ruleChainedViews(m).map((f) => `${f.model}:${f.message.match(/chain of (\d+)/)![1]}`)

  it("uses the evaluator default threshold of 5", () => {
    expect(CHAINED_VIEWS_THRESHOLD).toBe(5)
  })
  it("flags a chain of exactly 5 views once, on its last model, with the full finding", () => {
    expect(ruleChainedViews(manifest(chain(["v1", "v2", "v3", "v4", "v5"], "view", ["source.p.raw.x"])))).toEqual([
      {
        rule: CHAINED_VIEWS_RULE,
        severity: "warning",
        category: "Snowflake Cost",
        model: "v5",
        unscored: true,
        message: 'Model "v5" ends a chain of 5 views/ephemeral models (threshold 5)',
        detail:
          "Evidence: v1 (view) → v2 (view) → v3 (view) → v4 (view) → v5 (view). " +
          "A view re-runs its query on every read and an ephemeral model is inlined into every consumer, " +
          'so each query on "v5" recomputes the whole chain. Does not change the score.',
        fixSnippet: "-- Persist one model of the chain, e.g. in v3.sql:\n{{ config(materialized='table') }}  -- or 'incremental'",
      },
    ])
  })
  it("passes a chain of 4 views", () => {
    expect(ruleChainedViews(manifest(chain(["v1", "v2", "v3", "v4"])))).toEqual([])
  })
  it("counts ephemeral models as links and reads the materialization case- and space-insensitively", () => {
    const m = manifest([mat("a", "view"), mat("b", "ephemeral", ["a"]), mat("c", " VIEW ", ["b"]), mat("d", "Ephemeral", ["c"]), mat("e", "view", ["d"])])
    const [f] = ruleChainedViews(m)
    expect(f.model).toBe("e")
    expect(f.detail).toContain("a (view) → b (ephemeral) → c (view) → d (ephemeral) → e (view).")
  })

  describe("breaks the chain", () => {
    // 4 views + X + 4 views: flagged (9) only if X continues the chain.
    const around = (x: DbtManifestNode) =>
      manifest([...chain(["a1", "a2", "a3", "a4"]), { ...x, depends_on: { nodes: ["model.p.a4"] } }, ...chain(["b1", "b2", "b3", "b4"], "view", [x.unique_id])])
    it.each(["table", "incremental", "materialized_view", "dynamic_table", "streaming_table", "my_custom_materialization", ""])(
      "a model materialized as %j",
      (materialized) => {
        expect(ruleChainedViews(around(mat("x", materialized)))).toEqual([])
      },
    )
    it("a model with no materialization in the manifest", () => {
      expect(ruleChainedViews(around(mat("x", undefined)))).toEqual([])
    })
    it("seed and snapshot nodes, even carrying a view materialization", () => {
      for (const resource_type of ["seed", "snapshot"] as const) {
        const x: DbtManifestNode = { unique_id: `${resource_type}.p.x`, name: "x", resource_type, config: { materialized: "view" } }
        expect(ruleChainedViews(around(x))).toEqual([])
      }
    })
    it("control: a view in the same position continues the chain", () => {
      expect(ends(around(mat("x", "view")))).toEqual(["b4:9"])
      expect(ends(around(mat("x", "ephemeral")))).toEqual(["b4:9"])
    })
    it("sources, seeds, snapshots and models of another project never count as links", () => {
      for (const head of ["source.p.raw.x", "seed.p.s", "snapshot.p.snap", "model.other.ghost"]) {
        expect(ruleChainedViews(manifest(chain(["v1", "v2", "v3", "v4"], "view", [head])))).toEqual([])
      }
    })
  })

  describe("alerts only at the end of a chain", () => {
    it("reports a chain of 7 once, on its last model", () => {
      expect(ends(manifest(chain(["v1", "v2", "v3", "v4", "v5", "v6", "v7"])))).toEqual(["v7:7"])
    })
    it("a view whose only children are persisted is an end", () => {
      const m = manifest([...chain(["v1", "v2", "v3", "v4", "v5"]), mat("t1", "table", ["v5"]), mat("t2", "incremental", ["v5"])])
      expect(ends(m)).toEqual(["v5:5"])
    })
    it("reports one finding per end when a chain branches, each long enough on its own", () => {
      const m = manifest([...chain(["v1", "v2", "v3", "v4"]), mat("left", "view", ["v4"]), mat("right", "ephemeral", ["v4"]), mat("short", "view", ["v3"])])
      expect(ends(m)).toEqual(["left:5", "right:5"])
    })
  })

  describe("diamonds use the longest path", () => {
    it("takes the long branch of a diamond, not the short one", () => {
      // a → b → c → d → e and a → x → e: e's longest chain is 5 (through b, c, d).
      const m = manifest([mat("a", "view"), mat("x", "view", ["a"]), ...chain(["b", "c", "d"], "view", ["model.p.a"]), mat("e", "view", ["x", "d"])])
      const [f] = ruleChainedViews(m)
      expect(ends(m)).toEqual(["e:5"])
      expect(f.detail).toContain("Evidence: a (view) → b (view) → c (view) → d (view) → e (view).")
    })
    it("does not flag a diamond whose longest path is below the threshold", () => {
      const m = manifest([mat("a", "view"), mat("b", "view", ["a"]), mat("c", "view", ["a"]), mat("d", "view", ["b", "c"])])
      expect(ruleChainedViews(m)).toEqual([])
    })
    it("breaks ties on the first parent in depends_on order, so the evidence is stable", () => {
      const build = (order: string[]) =>
        manifest([mat("a", "view"), ...chain(["b1", "b2", "b3"], "view", ["model.p.a"]), ...chain(["c1", "c2", "c3"], "view", ["model.p.a"]), mat("e", "view", order)])
      expect(ruleChainedViews(build(["b3", "c3"]))[0].detail).toContain("a (view) → b1 (view) → b2 (view) → b3 (view) → e (view).")
      expect(ruleChainedViews(build(["c3", "b3"]))[0].detail).toContain("a (view) → c1 (view) → c2 (view) → c3 (view) → e (view).")
    })
    it("ignores a parent listed twice", () => {
      const m = manifest([...chain(["v1", "v2", "v3", "v4"]), mat("v5", "view", ["v4", "v4"])])
      expect(ends(m)).toEqual(["v5:5"])
    })
  })

  describe("cycles (dbt forbids them; hand-made manifests may not)", () => {
    it("terminates on a self-reference and on a cycle of views, with no end to report", () => {
      expect(ruleChainedViews(manifest([mat("self", "view", ["self"])]))).toEqual([])
      expect(ruleChainedViews(manifest([mat("a", "view", ["c"]), mat("b", "view", ["a"]), mat("c", "view", ["b"])]))).toEqual([])
    })
    it("terminates on a cycle feeding a chain and reports its end once, each model at most once in the path", () => {
      const m = manifest([mat("a", "view", ["c"]), mat("b", "view", ["a"]), mat("c", "view", ["b"]), ...chain(["t1", "t2", "t3"], "view", ["model.p.a"])])
      const fs = ruleChainedViews(m)
      expect(fs.map((f) => f.model)).toEqual(["t3"])
      const path = fs[0].detail!.match(/Evidence: (.*?)\. A view/)![1].split(" → ")
      expect(new Set(path).size).toBe(path.length)
    })
  })

  it("yields nothing on both shipped samples: their longest view chains are 2 and 1", () => {
    expect(ruleChainedViews(REVENUE_VARIANCE_MANIFEST)).toEqual([])
    expect(ruleChainedViews(SNAPSHOT_MANIFEST)).toEqual([])
  })

  describe("never changes the score, and leaves the other rules untouched", () => {
    // Chains (two ends) plus scored findings from other rules (root-model on the heads, missing-pk-tests
    // everywhere) and shared-column findings, so the order of the last two rules is observable.
    const m = manifest([
      ...chain(["v1", "v2", "v3", "v4", "v5", "v6"]),
      ...chain(["w1", "w2", "w3", "w4", "w5"], "ephemeral"),
      mat("fct", "table", ["v6", "w5"]),
      documented("dim_a", ["customer_id"], "Customer key."),
      documented("dim_b", ["customer_id"], "Customer key."),
    ])
    const totalModels = 14

    it("every chained-views finding is unscored", () => {
      const fs = ruleChainedViews(m)
      expect(fs.map((f) => f.model)).toEqual(["v6", "w5"])
      for (const f of fs) expect(f.unscored).toBe(true)
    })
    it("computeScore is identical with and without the chained-views findings", () => {
      const all = runManifestRules(m)
      const chained = all.filter((f) => f.rule === CHAINED_VIEWS_RULE)
      const others = all.filter((f) => f.rule !== CHAINED_VIEWS_RULE)
      expect(chained).toHaveLength(2)
      // The scored findings do move the score, so an equality below is not a trivial 100 = 100.
      expect(computeScore(others, totalModels)).toBeLessThan(100)
      expect(computeScore(all, totalModels)).toBe(computeScore(others, totalModels))
      expect(computeScore(chained, totalModels)).toBe(100)
      // Even many of them: still no effect.
      expect(computeScore([...others, ...chained, ...chained, ...chained], totalModels)).toBe(computeScore(others, totalModels))
    })
    it("runManifestRules = the existing rules, unchanged and in the same order, then chained-views", () => {
      expect(ruleSharedColumnDescription(m)).toHaveLength(2)
      for (const sample of [m, REVENUE_VARIANCE_MANIFEST, SNAPSHOT_MANIFEST]) {
        expect(runManifestRules(sample)).toEqual([
          ...ruleMissingPkTests(sample),
          ...ruleSourceFreshnessMissing(sample),
          ...ruleFanOut(sample),
          ...ruleRootModel(sample),
          ...ruleMultipleSourcesJoined(sample),
          ...ruleStagingDependsOnStaging(sample),
          ...ruleSharedColumnDescription(sample),
          ...ruleChainedViews(sample),
        ])
      }
    })
    it("jaffle replay: the recorded score is unchanged, and the joined lineage findings score the same without the rule", async () => {
      const run = await replaySnapshot()
      expect(run.score).toBe(SNAPSHOT_EXPECTED.score)
      const joined = joinRuntimeEvidence(runManifestRules(SNAPSHOT_MANIFEST, run.models), run.findings)
      const withoutRule = joined.filter((f) => f.rule !== CHAINED_VIEWS_RULE)
      expect(computeScore(joined, run.totalModels)).toBe(computeScore(withoutRule, run.totalModels))
    })
  })
})
