"use client"

import { useEffect, useState, type ReactNode } from "react"
import { AuditFlow } from "@/components/audit-flow"
import { AuditScoreCard } from "@/components/audit-score-card"
import { FindingsTable } from "@/components/findings-table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { AuditConfig } from "@/lib/config"
import type { AuditResult } from "@/lib/audit-engine"
import type { QuestionOutcome, TrustResult } from "@/lib/trust-contract"
import { latestOnly } from "@/lib/latest-request"

function toScoreCardData(r: TrustResult): AuditResult {
  return {
    totalModels: r.questions.length,
    errors: r.failed,
    warnings: r.warnings,
    infos: 0,
    score: r.score,
    checks: [],
    findings: r.findings,
    models: [],
    config: {} as AuditConfig,
    runAt: "",
  }
}

const OUTCOME_BADGE: Record<QuestionOutcome, "secondary" | "destructive" | "warning"> = {
  pass: "secondary",
  warning: "warning",
  fail: "destructive",
}

function downloadJson(result: TrustResult) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "trust-sprint-report.json"
  a.click()
  URL.revokeObjectURL(url)
}

export default function TrustPage() {
  const [result, setResult] = useState<TrustResult | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  const [guard] = useState(latestOnly)

  useEffect(() => {
    const token = guard.start()
    fetch("/api/trust")
      .then((res) => res.json())
      .then((body) => guard.isLatest(token) && setResult(body))
      .catch(() => guard.isLatest(token) && setErrors(["Could not load the demo report. Reload the page to try again."]))
  }, [guard])

  async function onUpload(file: File) {
    const token = guard.start()
    setErrors([])
    try {
      const res = await fetch("/api/trust", { method: "POST", body: await file.text() })
      const body = await res.json().catch(() => null)
      if (!guard.isLatest(token)) return
      if (!res.ok || !body) {
        setErrors(body?.errors ?? [`The server could not check this report (HTTP ${res.status}). Try again.`])
        return
      }
      setResult(body)
    } catch {
      if (guard.isLatest(token)) setErrors(["The report could not be sent. Check your connection and try again."])
    }
  }

  const waiting: ReactNode = <p className="text-sm text-muted-foreground">Loading the report.</p>

  const inputs = (
    <div className="space-y-4">
      {result && (result.synthetic || result.demo) && (
        <Alert>
          <AlertTitle>{result.synthetic ? "illustrative, synthetic data" : "recorded real run"}</AlertTitle>
          <AlertDescription>
            {result.synthetic
              ? `${result.demo ? "Bundled demo report" : "Uploaded report"} (${result.source}). Not a real client engagement.`
              : `${result.source}. Viewing this page runs no query.`}
          </AlertDescription>
        </Alert>
      )}
      <label className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">Load a toolkit report (JSON):</span>
        <input
          type="file"
          accept="application/json,.json"
          className="text-sm text-muted-foreground file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onUpload(f)
          }}
        />
      </label>
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Report rejected</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {result ? (
        <Card>
          <CardContent className="overflow-x-auto px-3 pt-3 sm:px-6 sm:pt-6">
            <Table className="table-stack">
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Definition</TableHead>
                  <TableHead>Grain</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.metrics.map((m) => (
                  <TableRow key={m.name}>
                    <TableCell data-label="Metric" className="stack-wide font-medium">{m.name}</TableCell>
                    <TableCell data-label="Definition" className="stack-wide">{m.definition}</TableCell>
                    <TableCell data-label="Grain">{m.grain}</TableCell>
                    <TableCell data-label="Owner">{m.owner}</TableCell>
                    <TableCell data-label="Type">{m.metric_type}</TableCell>
                    <TableCell data-label="Status">
                      <Badge variant={m.status === "verified" ? "secondary" : "warning"}>{m.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        waiting
      )}
    </div>
  )

  const evaluation = result ? (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {result.passed} passed, {result.failed} failed, {result.warnings} with a trust warning.
      </p>
      <Card>
        <CardContent className="overflow-x-auto px-3 pt-3 sm:px-6 sm:pt-6">
          <Table className="table-stack">
            <TableHeader>
              <TableRow>
                <TableHead>Business question</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.questions.map((q) => (
                <TableRow key={q.question}>
                  <TableCell data-label="Business question" className="stack-wide font-medium">{q.question}</TableCell>
                  <TableCell data-label="Metric">{q.metric}</TableCell>
                  <TableCell data-label="Outcome">
                    <Badge variant={OUTCOME_BADGE[q.outcome]}>{q.outcome}</Badge>
                  </TableCell>
                  <TableCell data-label="Why" className="stack-wide text-muted-foreground">{q.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  ) : (
    waiting
  )

  const risk = result ? (
    <div className="space-y-4">
      <AuditScoreCard data={toScoreCardData(result)} unit="questions" />
      <FindingsTable findings={result.findings} />
    </div>
  ) : (
    waiting
  )

  const recommendations = result ? (
    result.recommendations.length === 0 ? (
      <p className="text-sm text-muted-foreground">Every question passed. Nothing to fix before rollout.</p>
    ) : (
      <ol className="space-y-3">
        {result.recommendations.map((r) => (
          <li key={r.question} className="rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Badge variant={r.severity === "error" ? "destructive" : "warning"}>{r.severity}</Badge>
              <span className="text-sm font-medium">{r.metric}</span>
            </div>
            <p className="mt-2 text-sm">{r.action}</p>
            <p className="mt-1 text-xs text-muted-foreground">Question: {r.question}</p>
          </li>
        ))}
      </ol>
    )
  ) : (
    waiting
  )

  const evidence = result ? (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Checks run by the Trust Sprint toolkit: every metric a question uses must be in the trust map, and every ratio
        metric must guard its denominator against zero.
      </p>
      <Button variant="outline" onClick={() => downloadJson(result)}>
        Download report (JSON)
      </Button>
    </div>
  ) : (
    waiting
  )

  return (
    <AuditFlow
      title="Trust Sprint"
      description="Which business questions are safe to answer with AI analytics, and where the semantic layer still has gaps."
      inputs={inputs}
      evaluation={evaluation}
      risk={risk}
      recommendations={recommendations}
      evidence={evidence}
    />
  )
}
