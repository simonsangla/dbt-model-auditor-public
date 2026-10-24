// Reads the findings table of the snowflake-account-audit notebook (block H) and
// derives the block I verdict. Pure functions: the page runs them in the browser,
// so a client's findings never leave the operator's machine.
import { computeScore, type AuditFinding, type Severity } from "./audit-engine"

export const BLOCK_H_COLUMNS = ["rule", "passe", "severity", "title", "detail", "evidence"] as const
export const BLOCK_H_SEVERITIES = ["red", "orange", "green", "info", "UNVERIFIABLE", "ERROR", "n/a"] as const
export type BlockHSeverity = (typeof BLOCK_H_SEVERITIES)[number]
export type Verdict = "OUI" | "NON" | "A CONFIRMER"

export interface AccountAuditRow {
  rule: string
  passe: string
  severity: BlockHSeverity
  title: string
  detail: string
  evidence: string
}

export interface AccountAuditResult {
  rows: AccountAuditRow[]
  findings: AuditFinding[]
  unverifiable: AccountAuditRow[]
  notApplicable: AccountAuditRow[]
  /** Rules with a result that counts: every row except n/a. */
  evaluated: number
  passed: number
  score: number | null
  verdict: Verdict
}

/** RFC 4180 CSV: quoted fields may hold commas, doubled quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        quoted = false
      } else {
        field += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else {
      field += c
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""))
}

/** Block I: any red gives NON; otherwise any UNVERIFIABLE or ERROR gives A CONFIRMER; otherwise OUI. */
export function verdictOf(severities: string[]): Verdict {
  if (severities.includes("red")) return "NON"
  if (severities.includes("UNVERIFIABLE") || severities.includes("ERROR")) return "A CONFIRMER"
  return "OUI"
}

const TO_FINDING: Partial<Record<BlockHSeverity, Severity>> = { red: "error", orange: "warning", info: "info" }

export function readAccountAudit(text: string): { ok: boolean; errors: string[]; result?: AccountAuditResult } {
  const [header, ...body] = parseCsv(text.replace(/^\uFEFF/, ""))
  if (!header) return { ok: false, errors: ["the file is empty"] }
  const idx = header.map((h) => h.trim().toLowerCase())
  const missing = BLOCK_H_COLUMNS.filter((c) => !idx.includes(c))
  if (missing.length) return { ok: false, errors: [`missing block H column(s): ${missing.join(", ")}`] }
  if (body.length === 0) return { ok: false, errors: ["the table has no rows"] }

  const errors: string[] = []
  const rows: AccountAuditRow[] = body.map((cells, n) => {
    const get = (c: string) => (cells[idx.indexOf(c)] ?? "").trim()
    const severity = get("severity")
    if (!(BLOCK_H_SEVERITIES as readonly string[]).includes(severity)) {
      errors.push(`row ${n + 2}: unknown severity "${severity}"`)
    }
    return { rule: get("rule"), passe: get("passe"), severity: severity as BlockHSeverity, title: get("title"), detail: get("detail"), evidence: get("evidence") }
  })
  if (errors.length) return { ok: false, errors }

  return { ok: true, errors: [], result: toResult(rows) }
}

function toResult(rows: AccountAuditRow[]): AccountAuditResult {
  const findings: AuditFinding[] = rows
    .filter((r) => TO_FINDING[r.severity])
    .map((r) => ({ rule: r.rule, severity: TO_FINDING[r.severity]!, message: r.title, detail: r.detail || undefined, model: r.evidence || undefined }))
  const evaluated = rows.filter((r) => r.severity !== "n/a").length
  return {
    rows,
    findings,
    unverifiable: rows.filter((r) => r.severity === "UNVERIFIABLE" || r.severity === "ERROR"),
    notApplicable: rows.filter((r) => r.severity === "n/a"),
    evaluated,
    passed: rows.filter((r) => r.severity === "green").length,
    score: computeScore(findings, evaluated),
    verdict: verdictOf(rows.map((r) => r.severity)),
  }
}

/**
 * The anonymised method note of block I (report/method_note_<date>.md), the only
 * part of a run allowed to leave the account: rule, pass, severity and finding
 * type, no object names and no values. Its stated verdict must match its rows.
 */
export function readMethodNote(text: string): { ok: boolean; errors: string[]; result?: AccountAuditResult } {
  const stated = /Verdict proposed:\s*(.+)/.exec(text)?.[1]?.trim()
  const lines = text.split(/\r?\n/).filter((l) => /^\|\s*R\d/.test(l))
  if (lines.length === 0) return { ok: false, errors: ["no rule rows in the method note"] }
  const errors: string[] = []
  const rows: AccountAuditRow[] = lines.map((l, n) => {
    const [rule = "", passe = "", severity = "", title = ""] = l.split("|").slice(1, -1).map((c) => c.trim())
    if (!(BLOCK_H_SEVERITIES as readonly string[]).includes(severity)) errors.push(`rule row ${n + 1}: unknown severity "${severity}"`)
    return { rule, passe, severity: severity as BlockHSeverity, title, detail: "", evidence: "" }
  })
  if (errors.length) return { ok: false, errors }
  const result = toResult(rows)
  // "\u00c0 CONFIRMER" in the note; compared without accents.
  const plain = stated?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
  if (plain !== result.verdict) {
    return { ok: false, errors: [`stated verdict "${stated ?? "none"}" disagrees with its own rows (${result.verdict})`] }
  }
  return { ok: true, errors: [], result }
}

/** A method note starts with its title; anything else is read as the block H CSV. */
export function readAuditFile(text: string): { ok: boolean; errors: string[]; result?: AccountAuditResult } {
  return /^\s*# Method note/.test(text) ? readMethodNote(text) : readAccountAudit(text)
}
