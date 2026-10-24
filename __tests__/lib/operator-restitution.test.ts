import { describe, it, expect } from "vitest"
import { readMethodNote, readAccountAudit } from "../../lib/account-audit-contract"
import {
  defaultOperatorState,
  verdictGapSentence,
  familyOf,
  groupByFamily,
  totalDays,
  buildRestitutionMarkdown,
  type OperatorState,
} from "../../lib/operator-restitution"
import { RULE_TITLES_FR, ruleTitle } from "../../lib/account-audit-rules-fr"
import { RULE_TITLES } from "../../lib/account-audit-rules"
import SAMPLE from "../../lib/account-audit-sample.json"

const note = (verdict: string, ...rows: string[]) =>
  ["# Method note, 2026-01-01", "", `- Verdict proposed: ${verdict}`, "", "| Rule | Pass | Severity | Finding type |", "|---|---|---|---|", ...rows].join("\n")

const sample = readMethodNote(SAMPLE.methodNote).result!
const small = readMethodNote(
  note("NON", "| R01 | 1 | red | Inference |", "| R17 | - | UNVERIFIABLE | Lectures |", "| R21 | 3 | orange | Verified |", "| R04 | 1 | green | Role |"),
).result!

describe("rule titles FR", () => {
  it("covers every rule that has an English title", () => {
    for (const r of Object.keys(RULE_TITLES)) expect(RULE_TITLES_FR[r], r).toBeTruthy()
  })
  it("covers the notebook v17 rules R27 to R34 (notebook v17)", () => {
    for (const r of ["R27", "R28", "R29", "R30", "R32", "R33", "R34"]) expect(RULE_TITLES_FR[r], r).toBeTruthy()
  })
  it("has no R31: folded into R01 in notebook v17", () => {
    expect(RULE_TITLES_FR.R31).toBeUndefined()
  })
  it("falls back to English, then to the row title", () => {
    expect(ruleTitle("R01", "x")).toBe(RULE_TITLES_FR.R01)
    expect(ruleTitle("R99", "row title")).toBe("row title")
    expect(ruleTitle("R99", "")).toBe("R99")
  })
})

describe("operator verdict layer", () => {
  it("defaults the operator verdict from the tool verdict", () => {
    expect(defaultOperatorState(small).verdict).toBe("NON")
    expect(defaultOperatorState(sample).verdict).toBe("A CONFIRMER")
  })
  it("explains the gap when verdicts differ, and says so when aligned", () => {
    expect(verdictGapSentence("NON", "OUI SOUS CONDITIONS")).toMatch(/outil/i)
    expect(verdictGapSentence("NON", "OUI SOUS CONDITIONS")).not.toBe(verdictGapSentence("NON", "NON"))
    expect(verdictGapSentence("A CONFIRMER", "A CONFIRMER")).toMatch(/align/i)
  })
  it("tags orange rows as client decisions by default and keeps limit reasons empty", () => {
    const s = defaultOperatorState(small)
    expect(s.clientDecisions).toEqual(["R21"])
    expect(s.limitReasons).toEqual({})
  })
})

describe("families", () => {
  it("maps the pass to a family and groups only rules to act on", () => {
    expect(familyOf({ rule: "R01", passe: "1" } as never)).toBe("Compte et gouvernance")
    expect(familyOf({ rule: "R17", passe: "-" } as never)).toBe("Couverture")
    const g = groupByFamily(small.rows)
    expect(g.map((x) => x.family)).toEqual(["Compte et gouvernance", "Configuration Cortex", "Couverture"])
    expect(g.flatMap((x) => x.rows.map((r) => r.rule)).sort()).toEqual(["R01", "R17", "R21"])
  })
})

describe("days", () => {
  const s = (days: (number | null)[]): OperatorState => ({
    ...defaultOperatorState(small),
    conditions: days.map((d, i) => ({ id: `c${i}`, text: `cond ${i}`, rules: ["R01"], days: d })),
  })
  it("is null when no condition carries a charge", () => expect(totalDays(s([null, null]))).toBeNull())
  it("sums the charges entered", () => expect(totalDays(s([0.5, null, 1.25]))).toBe(1.75))
})

describe("markdown export", () => {
  const state: OperatorState = {
    verdict: "OUI SOUS CONDITIONS",
    conditions: [{ id: "c1", text: "Poser une politique réseau", rules: ["R03", "R01"], days: 0.5 }],
    clientDecisions: ["R21"],
    limitReasons: { R17: "volontairement non demandé" },
  }
  const md = buildRestitutionMarkdown(small, state)
  it("shows both verdicts and the gap sentence", () => {
    expect(md).toContain("Verdict outil : NON")
    expect(md).toContain("Verdict opérateur : OUI SOUS CONDITIONS")
    expect(md).toContain(verdictGapSentence("NON", "OUI SOUS CONDITIONS"))
  })
  it("has the four structure parts in order", () => {
    const at = ["## 1. Verdicts", "## 2. Constats par famille", "## 3. Décisions client à confirmer par écrit", "## 4. Limites de la lecture"].map((h) => md.indexOf(h))
    at.forEach((p) => expect(p).toBeGreaterThanOrEqual(0))
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
  it("lists conditions with charge and total, French titles, and the limit reason", () => {
    expect(md).toContain("0,5 j")
    expect(md).toContain("Total estimé : 0,5 j")
    expect(md).toContain(RULE_TITLES_FR.R21)
    expect(md).toContain("volontairement non demandé")
  })
  it("never presents the score, and omits the estimate when no charge is entered", () => {
    expect(md.toLowerCase()).not.toMatch(/score/)
    const none = buildRestitutionMarkdown(small, { ...state, conditions: [{ id: "c1", text: "x", rules: [], days: null }] })
    expect(none).not.toMatch(/Total estimé/)
    expect(none).not.toMatch(/\bj\b/)
  })
  it("flags a limit without a stated reason instead of hiding it", () => {
    const m = buildRestitutionMarkdown(small, { ...state, limitReasons: {} })
    expect(m).toContain("raison non renseignée")
  })
  it("works on the recorded sample (shape only, no detail)", () => {
    expect(buildRestitutionMarkdown(sample, defaultOperatorState(sample))).toContain("Verdict opérateur : A CONFIRMER")
  })
  it("reads CSV-derived results too", () => {
    const r = readAccountAudit("rule,passe,severity,title,detail,evidence\nR01,1,red,t,d,P1-Q1").result!
    expect(buildRestitutionMarkdown(r, defaultOperatorState(r))).toContain("R01")
  })
})
