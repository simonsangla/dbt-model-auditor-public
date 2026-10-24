"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { AlertCircle, AlertTriangle, Info } from "lucide-react"
import type { AuditFinding, Severity } from "@/lib/audit-engine"

function severityIcon(severity: Severity) {
  switch (severity) {
    case "error": return <AlertCircle className="h-4 w-4 text-destructive" />
    case "warning": return <AlertTriangle className="h-4 w-4 text-warning" />
    case "info": return <Info className="h-4 w-4 text-info" />
  }
}

function severityVariant(severity: Severity): "destructive" | "warning" | "info" {
  switch (severity) {
    case "error": return "destructive"
    case "warning": return "warning"
    case "info": return "info"
  }
}

export function FindingsTable({ findings }: { findings: AuditFinding[] }) {

  return (
    <Card>
      <CardHeader className="px-3 sm:px-6">
        <CardTitle className="text-lg">Audit Findings ({findings.length})</CardTitle>
      </CardHeader>
      <CardContent className="px-3 sm:px-6">
        {findings.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">No findings.</p>
        ) : (
          <div className="sm:overflow-auto sm:max-h-[500px]">
            <Table className="table-stack">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead>Rule</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Model</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findings.map((f, i) => (
                  <TableRow key={i}>
                    <TableCell>{severityIcon(f.severity)}</TableCell>
                    <TableCell data-label="Rule" className="font-mono text-xs">{f.rule}</TableCell>
                    <TableCell data-label="Severity">
                      <Badge variant={severityVariant(f.severity)}>{f.severity}</Badge>
                    </TableCell>
                    <TableCell data-label="Message" className="stack-wide max-w-[400px] whitespace-normal">
                      {f.message}
                      {f.detail && <span className="block text-xs text-muted-foreground mt-0.5">{f.detail}</span>}
                    </TableCell>
                    <TableCell data-label="Model" className="font-mono text-xs">{f.model ?? "\u2014"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
