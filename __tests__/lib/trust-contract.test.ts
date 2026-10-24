import { describe, it, expect } from "vitest"
import { validateTrustReport, toTrustResult, type TrustReport } from "../../lib/trust-contract"
import { computeScore } from "../../lib/audit-engine"

const report: TrustReport = {
  schema_version: 1,
  source: "unit-test",
  synthetic: true,
  metrics: [
    { name: "Total Bookings", definition: "d", grain: "Daily", owner: "o", metric_type: "simple", status: "verified" },
    { name: "Conversion Rate", definition: "d", grain: "Daily", owner: "o", metric_type: "ratio", status: "warning" },
  ],
  questions: [
    { question: "q1", metric: "Total Bookings", outcome: "pass", message: "ok" },
    { question: "q2", metric: "Conversion Rate", outcome: "warning", message: "ratio not zero-guarded" },
    { question: "q3", metric: "Churn Rate", outcome: "fail", message: "metric not in trust map" },
  ],
}

describe("validateTrustReport", () => {
  it("accepts a well-formed report", () => {
    const r = validateTrustReport(report)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.report).toEqual(report)
  })

  it("rejects a non-object with errors and no report (V2)", () => {
    const r = validateTrustReport("nope")
    expect(r.ok).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.report).toBeUndefined()
  })

  it("rejects wrong schema_version, bad outcome and bad metric_type (V2)", () => {
    const bad = {
      ...report,
      schema_version: 2,
      metrics: [{ ...report.metrics[0], metric_type: "weird" }],
      questions: [{ ...report.questions[0], outcome: "maybe" }],
    }
    const r = validateTrustReport(bad)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/schema_version/)
    expect(r.errors.join(" ")).toMatch(/metric_type/)
    expect(r.errors.join(" ")).toMatch(/outcome/)
  })
})

describe("toTrustResult", () => {
  const result = toTrustResult(report, { demo: false })

  it("maps fail→error, warning→warning, pass→no finding (V4)", () => {
    expect(result.findings).toEqual([
      { rule: "trust-question", severity: "warning", message: "ratio not zero-guarded", model: "Conversion Rate", detail: "q2" },
      { rule: "trust-question", severity: "error", message: "metric not in trust map", model: "Churn Rate", detail: "q3" },
    ])
  })

  it("scores with computeScore over the question count (V5)", () => {
    expect(result.score).toBe(computeScore(result.findings, report.questions.length))
  })

  it("counts add up to the number of questions (V6)", () => {
    expect([result.passed, result.failed, result.warnings]).toEqual([1, 1, 1])
    expect(result.passed + result.failed + result.warnings).toBe(report.questions.length)
  })

  it("carries the synthetic flag and demo flag through", () => {
    expect(result.synthetic).toBe(true)
    expect(result.demo).toBe(false)
  })
})

describe("recommendations (derived, never hand-written)", () => {
  const result = toTrustResult(report, { demo: false })

  it("one recommendation per non-passing question, errors first", () => {
    expect(result.recommendations.map((r) => [r.severity, r.metric])).toEqual([
      ["error", "Churn Rate"],
      ["warning", "Conversion Rate"],
    ])
  })

  it("a metric missing from the trust map is told to be defined first", () => {
    expect(result.recommendations[0].action).toBe(
      "Add Churn Rate to the trust map with a definition, grain and owner before this question goes live.",
    )
  })

  it("a warning on a mapped metric asks to resolve the stated issue before rollout", () => {
    expect(result.recommendations[1].action).toBe("Resolve before rollout: ratio not zero-guarded.")
  })
})
