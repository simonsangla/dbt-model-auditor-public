"use client"

import { useState, type ReactNode } from "react"
import { usePublicMode } from "@/lib/use-public-mode"
import SAMPLE from "@/lib/account-audit-sample.json"
import { ruleTitle } from "@/lib/account-audit-rules-fr"
import { OperatorRestitution } from "@/components/operator-restitution"
import { AuditFlow } from "@/components/audit-flow"
import { AuditScoreCard } from "@/components/audit-score-card"
import { FindingsTable } from "@/components/findings-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AuditConfig } from "@/lib/config"
import type { AuditResult } from "@/lib/audit-engine"
import { readAuditFile, readMethodNote, type AccountAuditResult, type BlockHSeverity, type Verdict } from "@/lib/account-audit-contract"

// Recorded demo: the anonymised method note of a real run (scripts/record-account-audit.mjs).
const RECORDED = readMethodNote(SAMPLE.methodNote).result ?? null

const SEVERITY_BADGE: Record<BlockHSeverity, "destructive" | "warning" | "info" | "secondary" | "outline"> = {
  red: "destructive",
  orange: "warning",
  info: "info",
  green: "secondary",
  UNVERIFIABLE: "outline",
  ERROR: "outline",
  "n/a": "outline",
}

const VERDICT: Record<Verdict, { title: string; text: string; variant: "default" | "destructive" }> = {
  OUI: { title: "Industrialisable: OUI (proposal)", text: "No red finding and every rule was verified.", variant: "default" },
  NON: { title: "Industrialisable: NON (proposal)", text: "At least one red finding blocks industrialisation.", variant: "destructive" },
  "A CONFIRMER": {
    title: "Industrialisable: A CONFIRMER (proposal)",
    text: "Nothing red, but some rules could not be verified with this role.",
    variant: "default",
  },
}

function toScoreCardData(r: AccountAuditResult): AuditResult {
  const count = (s: string) => r.findings.filter((f) => f.severity === s).length
  return {
    totalModels: r.evaluated,
    errors: count("error"),
    warnings: count("warning"),
    infos: count("info"),
    score: r.score,
    checks: [],
    findings: r.findings,
    models: [],
    config: {} as AuditConfig,
    runAt: "",
  }
}

export default function AccountAuditPage() {
  const demoOnly = usePublicMode() !== false
  const [result, setResult] = useState<AccountAuditResult | null>(RECORDED)
  const [recorded, setRecorded] = useState(RECORDED !== null)
  const [loadId, setLoadId] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const shapeOnly = result ? result.rows.every((r) => !r.detail && !r.evidence) : false
  const [showPassing, setShowPassing] = useState(false)
  // Passing and context rules fold away on a phone so the ones to act on come first.
  const folded = (s: BlockHSeverity) => s === "green" || s === "info" || s === "n/a"
  const foldCount = result ? result.rows.filter((r) => folded(r.severity)).length : 0

  async function onFile(file: File) {
    // Parsed here, in the browser: a client's findings are never sent to a server.
    const read = readAuditFile(await file.text())
    setErrors(read.errors)
    setResult(read.ok && read.result ? read.result : null)
    setRecorded(false)
    setLoadId((n) => n + 1)
  }

  const waiting: ReactNode = <p className="text-sm text-muted-foreground">Load a findings table to fill this section.</p>

  const inputs = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {demoOnly
          ? "Recorded demo of the snowflake-account-audit notebook: the anonymised result of a real run. Nothing is uploaded or queried here."
          : "Run the snowflake-account-audit notebook in Snowsight, then load its anonymised method note (report/method_note_<date>.md) or the block H findings table downloaded as CSV. The file is read in this browser and never uploaded."}
      </p>
      {recorded && result && (
        <Alert>
          <AlertTitle>recorded real run</AlertTitle>
          <AlertDescription>
            Anonymised method note of run {SAMPLE.run} on the operator&apos;s own Snowflake account: rule, pass and
            severity only, no object names and no values. {demoOnly ? "" : "Load your own file to replace it."}
          </AlertDescription>
        </Alert>
      )}
      {!demoOnly && (
      <label className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Method note (.md) or findings table (.csv):</span>
        <input
          type="file"
          accept="text/csv,.csv,text/markdown,.md"
          className="text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onFile(f)
          }}
        />
      </label>
      )}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Table rejected</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {result && (
        <p className="text-sm">
          {result.rows.length} rules read: {result.evaluated} evaluated, {result.notApplicable.length} not applicable.
        </p>
      )}
    </div>
  )

  const evaluation = result ? (
    <Card>
      <CardContent className="overflow-x-auto px-3 pt-3 sm:px-6 sm:pt-6">
        <Table className="table-stack" data-open={showPassing ? "" : undefined}>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Pass</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Title</TableHead>
              {!shapeOnly && <TableHead>Detail</TableHead>}
              {!shapeOnly && <TableHead>Evidence</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((r, i) => (
              <TableRow key={`${r.rule}-${i}`} className={folded(r.severity) ? "stack-fold" : undefined}>
                <TableCell data-label="Rule" className="font-mono text-xs">{r.rule}</TableCell>
                <TableCell data-label="Pass">{r.passe}</TableCell>
                <TableCell data-label="Severity">
                  <Badge variant={SEVERITY_BADGE[r.severity]}>{r.severity}</Badge>
                </TableCell>
                <TableCell data-label="Title" className="stack-wide font-medium" title={r.title}>
                  {ruleTitle(r.rule, r.title)}
                </TableCell>
                {!shapeOnly && <TableCell data-label="Detail" className="stack-wide text-muted-foreground">{r.detail}</TableCell>}
                {!shapeOnly && <TableCell data-label="Evidence" className="font-mono text-xs">{r.evidence}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {foldCount > 0 && (
          <button
            type="button"
            onClick={() => setShowPassing((v) => !v)}
            className="mt-3 w-full rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted sm:hidden"
          >
            {showPassing ? "Hide" : "Show"} {foldCount} passing and context rules
          </button>
        )}
      </CardContent>
    </Card>
  ) : (
    waiting
  )

  const risk = result ? (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Indicateur de couverture des règles, pas un verdict : le verdict est donné en section 04 et 05.
      </p>
      <AuditScoreCard data={toScoreCardData(result)} unit="rules" />
      <FindingsTable findings={result.findings} />
    </div>
  ) : (
    waiting
  )

  const groups: { title: string; rows: AccountAuditResult["rows"] }[] = result
    ? [
        { title: "Resolve before industrialisation (red)", rows: result.rows.filter((r) => r.severity === "red") },
        { title: "Needs a client decision (orange)", rows: result.rows.filter((r) => r.severity === "orange") },
        { title: "Get the missing privilege and re-run (unverifiable)", rows: result.unverifiable },
      ].filter((g) => g.rows.length > 0)
    : []

  const recommendations = result ? (
    <div className="space-y-6">
      <OperatorRestitution key={loadId} result={result} />
      <h3 className="text-sm font-medium">Détail des constats (vue outil)</h3>
    {groups.length === 0 ? (
      <p className="text-sm text-muted-foreground">Nothing red, orange or unverifiable. Nothing to act on.</p>
    ) : (
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.title} className="space-y-2">
            <h3 className="text-sm font-medium">{g.title}</h3>
            <ol className="space-y-2">
              {g.rows.map((r, i) => (
                <li key={`${r.rule}-${i}`} className="rounded-lg border p-3 text-sm">
                  <span className="font-mono text-xs">{r.rule}</span> {ruleTitle(r.rule, r.title)}
                  {r.detail && <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    )}
    </div>
  ) : (
    waiting
  )

  const evidence = result ? (
    <div className="space-y-3 text-sm">
      <Alert variant={VERDICT[result.verdict].variant}>
        <AlertTitle>{VERDICT[result.verdict].title}</AlertTitle>
        <AlertDescription>
          {VERDICT[result.verdict].text} Same rule as the notebook&apos;s block I; the operator confirms before sharing.
        </AlertDescription>
      </Alert>
      <p className="text-muted-foreground">
        {shapeOnly
          ? "An anonymised method note carries no evidence ids; the detailed note with them stays in the audited account."
          : "Every row names the saved query result it read (P<pass>-Q<statement>)."}
        {result.notApplicable.length > 0 && ` Not applicable, excluded from the verdict: ${result.notApplicable.map((r) => r.rule).join(", ")}.`}
      </p>
    </div>
  ) : (
    waiting
  )

  return (
    <AuditFlow
      eyebrow="Snowflake account audit"
      title="Account audit"
      description="Is this Cortex setup ready to industrialise? Reads the findings of the snowflake-account-audit notebook, in your browser only."
      inputs={inputs}
      evaluation={evaluation}
      risk={risk}
      recommendations={recommendations}
      evidence={evidence}
    />
  )
}
