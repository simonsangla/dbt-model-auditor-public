import { describe, it, expect } from "vitest"
import { parseCsv, readAccountAudit, readAuditFile, readMethodNote, verdictOf } from "../../lib/account-audit-contract"
import SAMPLE from "../../lib/account-audit-sample.json"

// Test rows only: the shape of the snowflake-account-audit notebook's block H table.
const HEADER = "rule,passe,severity,title,detail,evidence"
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n")
const note = (verdict: string, ...rows: string[]) =>
  ["# Method note, 2026-01-01", "", `- Verdict proposed: ${verdict}`, "", "| Rule | Pass | Severity | Finding type |", "|---|---|---|---|", ...rows, "", "No object names, no values: shape only."].join("\n")

describe("parseCsv", () => {
  it("reads quoted fields with commas, doubled quotes and newlines", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi""\nthere"\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ])
  })
})

describe("verdictOf (block I rule)", () => {
  it("any red gives NON, else any UNVERIFIABLE or ERROR gives A CONFIRMER, else OUI", () => {
    expect(verdictOf(["green", "red", "UNVERIFIABLE"])).toBe("NON")
    expect(verdictOf(["green", "orange", "ERROR"])).toBe("A CONFIRMER")
    expect(verdictOf(["green", "orange", "info", "n/a"])).toBe("OUI")
  })
})

describe("readAccountAudit", () => {
  const r = readAccountAudit(
    csv(
      "R14,4,red,agent granted to PUBLIC,oui : accorde au role PUBLIC,P4b-Q7",
      "R03,1,orange,account network policy,none set,P1-Q8",
      "R04,1,info,audit role,AUDITOR,P1-Q3",
      "R12,3,green,search service state,ACTIVE,P3-Q7",
      "R13,4,UNVERIFIABLE,masking on base tables,refused,P4-Q3",
      "R19,3,n/a,legacy semantic model file,no tool of that kind,agent spec",
    ),
  )

  it("accepts a well-formed table", () => {
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("maps red to error, orange to warning, info to info; green, n/a and unverifiable are not findings", () => {
    expect(r.result!.findings.map((f) => `${f.rule}:${f.severity}`)).toEqual(["R14:error", "R03:warning", "R04:info"])
  })

  it("keeps unverifiable and not-applicable rules apart, and n/a out of the evaluated count", () => {
    expect(r.result!.unverifiable.map((x) => x.rule)).toEqual(["R13"])
    expect(r.result!.notApplicable.map((x) => x.rule)).toEqual(["R19"])
    expect(r.result!.evaluated).toBe(5)
    expect(r.result!.passed).toBe(1)
  })

  it("proposes the block I verdict", () => {
    expect(r.result!.verdict).toBe("NON")
  })

  it("rejects a table without the block H columns", () => {
    const bad = readAccountAudit("rule,severity\nR01,red")
    expect(bad.ok).toBe(false)
    expect(bad.errors.join(" ")).toMatch(/passe/)
  })

  it("rejects an unknown severity instead of guessing (method note too)", () => {
    expect(readMethodNote(note("OUI", "| R01 | 1 | purple | x |")).errors.join(" ")).toMatch(/purple/)
  })

  it("rejects an unknown severity instead of guessing", () => {
    const bad = readAccountAudit(csv("R01,1,purple,x,y,P1-Q2"))
    expect(bad.ok).toBe(false)
    expect(bad.errors.join(" ")).toMatch(/purple/)
  })
})

describe("readMethodNote (the anonymised note that may leave the account)", () => {
  const rows = ["| R13 | 4 | UNVERIFIABLE | masking |", "| R01 | 1 | orange | cross-region |", "| R04 | 1 | info | audit role |", "| R03 | 1 | green | network policy |"]

  it("reads rule, pass and severity; detail and evidence stay empty (shape only)", () => {
    const r = readMethodNote(note("\u00c0 CONFIRMER", ...rows))
    expect(r.ok).toBe(true)
    expect(r.result!.rows.map((x) => `${x.rule}:${x.passe}:${x.severity}`)).toEqual(["R13:4:UNVERIFIABLE", "R01:1:orange", "R04:1:info", "R03:1:green"])
    expect(r.result!.rows.every((x) => x.detail === "" && x.evidence === "")).toBe(true)
    expect(r.result!.verdict).toBe("A CONFIRMER")
  })

  it("rejects a note whose stated verdict disagrees with its own rows", () => {
    const r = readMethodNote(note("OUI", ...rows))
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/verdict/)
  })

  it("readAuditFile picks the reader from the content", () => {
    expect(readAuditFile(note("\u00c0 CONFIRMER", ...rows)).ok).toBe(true)
    expect(readAuditFile(csv("R12,3,green,x,y,P3-Q7")).ok).toBe(true)
  })
})

describe("bundled recorded run (lib/account-audit-sample.json)", () => {
  it("is an anonymised method note whose verdict matches its rows", () => {
    expect(SAMPLE.methodNote).toMatch(/No object names, no values/)
    const r = readMethodNote(SAMPLE.methodNote)
    expect(r.ok).toBe(true)
    expect(r.result!.rows.length).toBeGreaterThan(0)
    expect(r.result!.rows.every((x) => x.detail === "" && x.evidence === "")).toBe(true)
  })
})
