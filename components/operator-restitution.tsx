"use client"

import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AccountAuditResult } from "@/lib/account-audit-contract"
import { ruleTitle } from "@/lib/account-audit-rules-fr"
import {
  OPERATOR_VERDICTS,
  buildRestitutionMarkdown,
  defaultOperatorState,
  groupByFamily,
  totalDays,
  verdictGapSentence,
  type OperatorState,
  type OperatorVerdict,
} from "@/lib/operator-restitution"

// Operator layer: browser state only, nothing persisted, nothing sent.
export function OperatorRestitution({ result }: { result: AccountAuditResult }) {
  const [state, setState] = useState<OperatorState>(() => defaultOperatorState(result))
  const [draft, setDraft] = useState("")
  const groups = groupByFamily(result.rows)
  const total = totalDays(state)

  const patch = (p: Partial<OperatorState>) => setState((s) => ({ ...s, ...p }))
  const toggleDecision = (rule: string) =>
    patch({ clientDecisions: state.clientDecisions.includes(rule) ? state.clientDecisions.filter((r) => r !== rule) : [...state.clientDecisions, rule] })
  const updateCondition = (id: string, p: Partial<OperatorState["conditions"][number]>) =>
    patch({ conditions: state.conditions.map((c) => (c.id === id ? { ...c, ...p } : c)) })

  function addCondition() {
    const text = draft.trim()
    if (!text) return
    patch({ conditions: [...state.conditions, { id: `c${Date.now()}-${state.conditions.length}`, text, rules: [], days: null }] })
    setDraft("")
  }

  function exportMarkdown() {
    const url = URL.createObjectURL(new Blob([buildRestitutionMarkdown(result, state)], { type: "text/markdown" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "restitution-audit-compte.md"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6" data-testid="operator-restitution">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Verdict outil (règle mécanique)</p>
          <p className="text-lg font-semibold" data-testid="tool-verdict">{result.verdict}</p>
        </div>
        <div className="rounded-lg border p-3">
          <label htmlFor="operator-verdict" className="text-xs text-muted-foreground">Verdict opérateur (votre jugement)</label>
          <select
            id="operator-verdict"
            value={state.verdict}
            onChange={(e) => patch({ verdict: e.target.value as OperatorVerdict })}
            className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-semibold"
          >
            {OPERATOR_VERDICTS.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <Alert>
        <AlertTitle>Pourquoi deux verdicts</AlertTitle>
        <AlertDescription>{verdictGapSentence(result.verdict, state.verdict)}</AlertDescription>
      </Alert>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Conditions</h3>
        <ul className="space-y-2">
          {state.conditions.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
              <span className="min-w-0 flex-1">{c.text}</span>
              <Input
                aria-label="Règles liées (ex. R01, R03)"
                placeholder="R01, R03"
                className="h-8 w-28"
                defaultValue={c.rules.join(", ")}
                onBlur={(e) => updateCondition(c.id, { rules: e.target.value.split(/[ ,;]+/).map((r) => r.trim()).filter(Boolean) })}
              />
              <Input
                aria-label="Charge en jours, à valider (facultatif)"
                placeholder="jours (à valider)"
                inputMode="decimal"
                className="h-8 w-32"
                defaultValue={c.days ?? ""}
                onBlur={(e) => {
                  const n = Number(e.target.value.replace(",", "."))
                  updateCondition(c.id, { days: e.target.value.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n })
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => patch({ conditions: state.conditions.filter((x) => x.id !== c.id) })}>
                Retirer
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            aria-label="Nouvelle condition"
            placeholder="Nouvelle condition"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCondition()}
          />
          <Button type="button" variant="outline" onClick={addCondition}>Ajouter</Button>
        </div>
        {total !== null && <p className="text-xs text-muted-foreground">Total estimé : {String(total).replace(".", ",")} j (à valider)</p>}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium">Constats par famille</h3>
        {groups.length === 0 && <p className="text-sm text-muted-foreground">Aucun constat rouge, orange ou non vérifiable.</p>}
        {groups.map((g) => (
          <div key={g.family} className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">{g.family}</h4>
            <ul className="space-y-2">
              {g.rows.map((r, i) => {
                const limit = r.severity === "UNVERIFIABLE" || r.severity === "ERROR"
                return (
                  <li key={`${r.rule}-${i}`} className="space-y-2 rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{r.rule}</span>
                      <span className="min-w-0 flex-1 font-medium">{ruleTitle(r.rule, r.title)}</span>
                      <Badge variant={r.severity === "red" ? "destructive" : r.severity === "orange" ? "warning" : "outline"}>{r.severity}</Badge>
                      {state.clientDecisions.includes(r.rule) && <Badge variant="info">décision client à confirmer par écrit</Badge>}
                    </div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input type="checkbox" checked={state.clientDecisions.includes(r.rule)} onChange={() => toggleDecision(r.rule)} />
                      Décision client à confirmer par écrit
                    </label>
                    {limit && (
                      <Input
                        aria-label={`Raison de la limite pour ${r.rule}`}
                        placeholder="Raison de la limite (ex. volontairement non demandé)"
                        value={state.limitReasons[r.rule] ?? ""}
                        onChange={(e) => patch({ limitReasons: { ...state.limitReasons, [r.rule]: e.target.value } })}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <Button type="button" onClick={exportMarkdown}>Exporter la restitution (Markdown)</Button>
    </div>
  )
}
