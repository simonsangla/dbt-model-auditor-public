/**
 * Trust Sprint report contract: the JSON the Trust Sprint toolkit emits and
 * the auditor reads. Findings reuse the audit engine's shape and scoring.
 *
 * Pure module: no Snowflake or Cortex access (SPEC V1).
 */

import { computeScore, type AuditFinding } from "./audit-engine"

export type MetricType = "simple" | "ratio"
export type MetricStatus = "verified" | "warning"
export type QuestionOutcome = "pass" | "fail" | "warning"

export interface TrustMetric {
  name: string
  definition: string
  grain: string
  owner: string
  metric_type: MetricType
  status: MetricStatus
}

export interface TrustQuestion {
  question: string
  metric: string
  outcome: QuestionOutcome
  message: string
}

export interface TrustReport {
  schema_version: 1
  source: string
  synthetic: boolean
  metrics: TrustMetric[]
  questions: TrustQuestion[]
}

export interface Recommendation {
  severity: "error" | "warning"
  metric: string
  question: string
  action: string
}

export interface TrustResult {
  demo: boolean
  synthetic: boolean
  source: string
  metrics: TrustMetric[]
  questions: TrustQuestion[]
  findings: AuditFinding[]
  recommendations: Recommendation[]
  score: number | null
  passed: number
  failed: number
  warnings: number
}

export interface TrustValidation {
  ok: boolean
  report?: TrustReport
  errors: string[]
}

const METRIC_TYPES: MetricType[] = ["simple", "ratio"]
const METRIC_STATUSES: MetricStatus[] = ["verified", "warning"]
const OUTCOMES: QuestionOutcome[] = ["pass", "fail", "warning"]

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x)
}

function checkStrings(obj: Record<string, unknown>, keys: string[], where: string, errors: string[]) {
  for (const k of keys) {
    if (typeof obj[k] !== "string") errors.push(`${where}.${k} must be a string`)
  }
}

export function validateTrustReport(input: unknown): TrustValidation {
  const errors: string[] = []
  if (!isObject(input)) return { ok: false, errors: ["report must be a JSON object"] }

  if (input.schema_version !== 1) errors.push("schema_version must be 1")
  if (typeof input.source !== "string") errors.push("source must be a string")
  if (typeof input.synthetic !== "boolean") errors.push("synthetic must be a boolean")

  if (!Array.isArray(input.metrics)) {
    errors.push("metrics must be an array")
  } else {
    input.metrics.forEach((m, i) => {
      const where = `metrics[${i}]`
      if (!isObject(m)) return errors.push(`${where} must be an object`)
      checkStrings(m, ["name", "definition", "grain", "owner"], where, errors)
      if (!METRIC_TYPES.includes(m.metric_type as MetricType)) errors.push(`${where}.metric_type must be one of ${METRIC_TYPES.join(", ")}`)
      if (!METRIC_STATUSES.includes(m.status as MetricStatus)) errors.push(`${where}.status must be one of ${METRIC_STATUSES.join(", ")}`)
    })
  }

  if (!Array.isArray(input.questions)) {
    errors.push("questions must be an array")
  } else {
    input.questions.forEach((q, i) => {
      const where = `questions[${i}]`
      if (!isObject(q)) return errors.push(`${where} must be an object`)
      checkStrings(q, ["question", "metric", "message"], where, errors)
      if (!OUTCOMES.includes(q.outcome as QuestionOutcome)) errors.push(`${where}.outcome must be one of ${OUTCOMES.join(", ")}`)
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, report: input as unknown as TrustReport, errors: [] }
}

export function toTrustResult(report: TrustReport, opts: { demo: boolean }): TrustResult {
  const findings: AuditFinding[] = []
  let passed = 0
  let failed = 0
  let warnings = 0

  for (const q of report.questions) {
    if (q.outcome === "pass") {
      passed++
      continue
    }
    if (q.outcome === "fail") failed++
    else warnings++
    findings.push({
      rule: "trust-question",
      severity: q.outcome === "fail" ? "error" : "warning",
      message: q.message,
      model: q.metric,
      detail: q.question,
    })
  }

  const mapped = new Set(report.metrics.map((m) => m.name))
  const sentence = (s: string) => (s.endsWith(".") ? s : `${s}.`)
  const recommendations: Recommendation[] = report.questions
    .filter((q) => q.outcome !== "pass")
    .map((q) => ({
      severity: q.outcome === "fail" ? ("error" as const) : ("warning" as const),
      metric: q.metric,
      question: q.question,
      action: !mapped.has(q.metric)
        ? `Add ${q.metric} to the trust map with a definition, grain and owner before this question goes live.`
        : q.outcome === "fail"
          ? `Fix ${q.metric} before rollout: ${sentence(q.message)}`
          : `Resolve before rollout: ${sentence(q.message)}`,
    }))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1))

  return {
    demo: opts.demo,
    synthetic: report.synthetic,
    source: report.source,
    metrics: report.metrics,
    questions: report.questions,
    findings,
    recommendations,
    score: computeScore(findings, report.questions.length),
    passed,
    failed,
    warnings,
  }
}
