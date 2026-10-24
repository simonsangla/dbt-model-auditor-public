"use client"

import { HeaderText } from "@/components/audit-header-meta"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Terminal,
  Copy,
  Check,
  Lock,
  FileJson,
  ArrowRight,
} from "lucide-react"
import { generateSnowsightAuditScript, parseSnowsightJsonOutput, type ParseResult } from "@/lib/snowsight-battery"
import { AuditFlow } from "@/components/audit-flow"

export default function BatteryPage() {
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [jsonInput, setJsonInput] = useState("")
  const [parsedResult, setParsedResult] = useState<ParseResult | null>(null)
  const sqlScript = generateSnowsightAuditScript()

  const handleCopyScript = () => {
    navigator.clipboard.writeText(sqlScript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleParseJson = () => {
    if (!jsonInput.trim()) return
    const res = parseSnowsightJsonOutput(jsonInput)
    setParsedResult(res)
  }

  return (
    <AuditFlow
      title="Snowsight SQL Audit Battery"
      description={<HeaderText icon={<Terminal className="h-5 w-5" aria-hidden />}>Read-only SQL handoff for accounts where the app cannot connect.</HeaderText>}
      inputs={
        <Card className="border shadow-xs">
          <CardHeader className="pb-3 border-b"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base font-bold">Copy Snowsight SQL Script</CardTitle><CardDescription className="text-xs">Environment summary, disk spillage, Cortex Search services and semantic views</CardDescription></div><Button variant="outline" size="sm" onClick={handleCopyScript} className="h-8 text-xs gap-1.5 font-semibold">{copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied SQL!" : "Copy SQL Script"}</Button></div></CardHeader>
          <CardContent className="p-4 bg-muted/10"><pre className="p-4 bg-slate-950 text-slate-100 rounded-lg font-mono text-xs overflow-auto max-h-[420px] whitespace-pre-wrap leading-relaxed">{sqlScript}</pre></CardContent>
        </Card>
      }
      evaluation={
        <Card className="border shadow-xs">
          <CardHeader className="pb-3 border-b"><CardTitle className="text-base font-bold">Paste the SQL result</CardTitle><CardDescription className="text-xs">Paste the env_summary cell returned by Snowsight.</CardDescription></CardHeader>
          <CardContent className="p-4 flex flex-col space-y-4"><textarea value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} rows={12} className="w-full p-3 font-mono text-xs border rounded-lg bg-slate-950 text-slate-100" aria-label="Snowsight JSON result" /><Button onClick={handleParseJson} disabled={!jsonInput.trim()} className="w-full gap-2 bg-primary hover:bg-primary/90 text-white font-semibold text-xs"><FileJson className="h-3.5 w-3.5" /> Read summary</Button></CardContent>
        </Card>
      }
      risk={parsedResult && !parsedResult.ok ? <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg text-xs text-destructive dark:text-destructive">{parsedResult.error}</div> : <div className="p-4 border border-dashed rounded-lg text-xs text-muted-foreground">The parser reports malformed or incomplete evidence here; valid JSON continues to the recommendations section.</div>}
      recommendations={parsedResult && parsedResult.ok ? <div className="p-4 border rounded-lg space-y-2 text-xs">{([["Account", parsedResult.audit.account], ["Region", parsedResult.audit.region], ["Role", parsedResult.audit.role], ["Warehouse", parsedResult.audit.warehouse], ["Spilling queries", parsedResult.audit.spillQueriesFound]] as const).map(([label, value]) => <div key={label} className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-mono">{value ?? "not in pasted JSON"}</span></div>)}<Button onClick={() => router.push("/")} variant="outline" className="w-full text-xs gap-1.5 mt-2">Back to dbt Model Auditor <ArrowRight className="h-3.5 w-3.5" /></Button></div> : <div className="p-4 border border-dashed rounded-lg text-xs text-muted-foreground">Run the parser to expose account, region, role, warehouse and spill evidence.</div>}
      evidence={<div className="p-4 border rounded-lg text-xs text-muted-foreground flex items-center gap-2"><Lock className="h-3.5 w-3.5 text-primary" /> Read-only contract: the generated script contains SELECT and SHOW statements only; JSON is parsed in this browser.</div>}
    />
  )
}
