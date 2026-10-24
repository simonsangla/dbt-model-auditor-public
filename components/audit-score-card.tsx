"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Shield, AlertTriangle, AlertCircle, Info } from "lucide-react"
import type { AuditResult } from "@/lib/audit-engine"

function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground"
  if (score >= 80) return "text-primary"
  if (score >= 60) return "text-warning"
  return "text-destructive"
}

function scoreBg(score: number | null): string {
  if (score === null) return "bg-muted/30"
  if (score >= 80) return "bg-primary/10"
  if (score >= 60) return "bg-warning/10"
  return "bg-destructive/10"
}

export function AuditScoreCard({ data, unit = "tables and views" }: { data: AuditResult; unit?: string }) {
  const failedRequired = data.checks.some((c) => c.status === "failed")

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card className={scoreBg(data.score)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Audit Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-4xl font-bold ${scoreColor(data.score)}`}>{data.score ?? "n/a"}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {data.totalModels} {unit} analyzed
            {data.score === null &&
              (data.totalModels === 0
                ? " - nothing to score"
                : failedRequired
                  ? " - not scored: a required check failed"
                  : "")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Errors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-destructive">{data.errors}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Warnings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-warning">{data.warnings}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Info className="h-4 w-4 text-info" />
            Info
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-info">{data.infos}</div>
        </CardContent>
      </Card>
    </div>
  )
}
