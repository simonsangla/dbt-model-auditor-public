// Operator restitution layer over the tool's account-audit result. Pure functions,
// browser-side only: the operator's judgement is page state, never persisted or sent.
// The tool verdict (block I rule) stays untouched; the operator verdict sits beside it.
import type { AccountAuditResult, AccountAuditRow, Verdict } from "./account-audit-contract"
import { ruleTitle } from "./account-audit-rules-fr"

export const OPERATOR_VERDICTS = ["OUI SOUS CONDITIONS", "NON", "A CONFIRMER"] as const
export type OperatorVerdict = (typeof OPERATOR_VERDICTS)[number]

export interface Condition {
  id: string
  text: string
  /** Rule ids this condition answers. */
  rules: string[]
  /** Optional charge in days, "to validate"; null when not estimated. */
  days: number | null
}

export interface OperatorState {
  verdict: OperatorVerdict
  conditions: Condition[]
  /** Rules whose outcome is a client decision to confirm in writing. */
  clientDecisions: string[]
  /** Why a rule could not be read (e.g. deliberately not requested), by rule id. */
  limitReasons: Record<string, string>
}

export function defaultOperatorState(result: AccountAuditResult): OperatorState {
  const fromTool: Record<Verdict, OperatorVerdict> = { NON: "NON", "A CONFIRMER": "A CONFIRMER", OUI: "OUI SOUS CONDITIONS" }
  return {
    verdict: fromTool[result.verdict],
    conditions: [],
    clientDecisions: result.rows.filter((r) => r.severity === "orange").map((r) => r.rule),
    limitReasons: {},
  }
}

const toolRank: Record<Verdict, OperatorVerdict> = { NON: "NON", "A CONFIRMER": "A CONFIRMER", OUI: "OUI SOUS CONDITIONS" }

export function verdictGapSentence(tool: Verdict, operator: OperatorVerdict): string {
  if (toolRank[tool] === operator) return "Le verdict opérateur est aligné sur le verdict outil."
  return `Le verdict outil (${tool}) applique la règle mécanique (rouge = NON, lecture incomplète = A CONFIRMER, sinon OUI) ; le verdict opérateur (${operator}) est le jugement de l'auditeur après lecture des constats, avec ses conditions ci-dessous.`
}

const FAMILIES: Record<string, string> = {
  "1": "Compte et gouvernance",
  "2": "Données et modèle",
  "3": "Configuration Cortex",
  "4": "Contrôle d'accès",
  "5": "Coûts",
  "6": "Gel de l'existant",
  "7": "Fonctions IA Cortex",
}
const FAMILY_ORDER = [...Object.values(FAMILIES), "Couverture"]

export function familyOf(row: Pick<AccountAuditRow, "passe">): string {
  return FAMILIES[row.passe.trim()] ?? "Couverture"
}

const ACT_ON = new Set(["red", "orange", "UNVERIFIABLE", "ERROR"])

/** Rules to act on (red, orange, unverifiable), grouped by family in pass order. */
export function groupByFamily(rows: AccountAuditRow[]): { family: string; rows: AccountAuditRow[] }[] {
  return FAMILY_ORDER.map((family) => ({
    family,
    rows: rows.filter((r) => ACT_ON.has(r.severity) && familyOf(r) === family),
  })).filter((g) => g.rows.length > 0)
}

export function totalDays(state: OperatorState): number | null {
  const given = state.conditions.map((c) => c.days).filter((d): d is number => d !== null && Number.isFinite(d))
  return given.length ? given.reduce((a, b) => a + b, 0) : null
}

const fr = (n: number) => String(n).replace(".", ",")
const SEV_FR: Record<string, string> = { red: "rouge", orange: "orange", UNVERIFIABLE: "non vérifiable", ERROR: "erreur de lecture" }

export function buildRestitutionMarkdown(result: AccountAuditResult, state: OperatorState): string {
  const out: string[] = ["# Restitution de l'audit de compte", ""]

  out.push("## 1. Verdicts", "")
  out.push(`- Verdict outil : ${result.verdict}`)
  out.push(`- Verdict opérateur : ${state.verdict}`)
  out.push("", verdictGapSentence(result.verdict, state.verdict), "")
  if (state.conditions.length > 0) {
    const priced = state.conditions.some((c) => c.days !== null)
    out.push(priced ? "| # | Condition | Constats liés | Charge (à valider) |" : "| # | Condition | Constats liés |")
    out.push(priced ? "|---|---|---|---|" : "|---|---|---|")
    state.conditions.forEach((c, i) => {
      const base = `| ${i + 1} | ${c.text} | ${c.rules.join(", ") || "-"} |`
      out.push(priced ? `${base} ${c.days === null ? "-" : `${fr(c.days)} j`} |` : base)
    })
    const total = totalDays(state)
    if (total !== null) out.push("", `Total estimé : ${fr(total)} j (à valider)`)
    out.push("")
  }

  out.push("## 2. Constats par famille", "")
  const groups = groupByFamily(result.rows)
  if (groups.length === 0) out.push("Aucun constat rouge, orange ou non vérifiable.", "")
  for (const g of groups) {
    out.push(`### ${g.family}`, "")
    for (const r of g.rows) out.push(`- ${r.rule} : ${ruleTitle(r.rule, r.title)} (${SEV_FR[r.severity] ?? r.severity})`)
    out.push("")
  }

  out.push("## 3. Décisions client à confirmer par écrit", "")
  const decisions = result.rows.filter((r) => state.clientDecisions.includes(r.rule))
  if (decisions.length === 0) out.push("Aucune.", "")
  else out.push(...decisions.map((r) => `- ${r.rule} : ${ruleTitle(r.rule, r.title)}`), "")

  out.push("## 4. Limites de la lecture", "")
  if (result.unverifiable.length === 0) out.push("Toutes les règles applicables ont été lues.", "")
  else
    out.push(
      ...result.unverifiable.map(
        (r) => `- ${r.rule} : ${ruleTitle(r.rule, r.title)} : ${state.limitReasons[r.rule]?.trim() || "raison non renseignée"}`,
      ),
      "",
    )
  if (result.notApplicable.length > 0) out.push(`Non applicables, hors verdict : ${result.notApplicable.map((r) => r.rule).join(", ")}.`, "")

  out.push("Une lecture refusée est « non vérifiable », jamais « conforme ».", "")
  return out.join("\n")
}
