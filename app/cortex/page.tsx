"use client"

import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { BrainCircuit, Loader2 } from "lucide-react"
import { CortexInfraPanel } from "@/components/cortex-infra-panel"
import { AuditFlow } from "@/components/audit-flow"
import { HeaderText } from "@/components/audit-header-meta"
import { usePublicMode } from "@/lib/use-public-mode"
import { type AuditConfig, CONFIG_KEY, configToParams } from "@/lib/config"
import type { CortexInfraAuditResult } from "@/lib/cortex-infra-auditor"
import { CORTEX_MODELS, type CortexTask, type CortexModel } from "@/lib/cortex-models"
import type { CortexAuditResponse } from "@/lib/cortex"

const SAMPLE_SQL = `WITH raw_orders AS (
    SELECT * FROM {{ source('jaffle_shop', 'raw_orders') }}
),

stg_payments AS (
    SELECT * FROM {{ ref('stg_payments') }}
),

order_aggregations AS (
    SELECT 
        o.order_id,
        o.customer_id,
        o.order_date,
        COALESCE(SUM(p.amount), 0) AS total_amount_usd,
        COUNT(p.payment_id) AS payment_count
    FROM raw_orders o
    LEFT JOIN stg_payments p ON o.order_id = p.order_id
    GROUP BY 1, 2, 3
)

SELECT * FROM order_aggregations;`

export default function CortexPage() {
  const [config, setConfig] = useState<AuditConfig | null>(null)
  const locked = usePublicMode()

  // Model Auditor state
  const [modelName, setModelName] = useState("fct_order_payments")
  const [sqlCode, setSqlCode] = useState(SAMPLE_SQL)
  const [task, setTask] = useState<CortexTask>("document")
  const [cortexModel, setCortexModel] = useState<CortexModel>("mistral-large2")
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<CortexAuditResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const [runError, setRunError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONFIG_KEY)
      setConfig(saved ? (JSON.parse(saved) as AuditConfig) : null)
    } catch {
      setConfig(null)
    }
  }, [])

  const params = config ? configToParams(config).toString() : ""
  const { data: infraData, isLoading: infraLoading, error: infraError } = useQuery<CortexInfraAuditResult>({
    queryKey: ["cortex-infra", params],
    queryFn: async () => {
      const res = await fetch(`/api/cortex-infra?${params}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      return body
    },
    retry: false,
    enabled: !!config && !config.demo && locked === false,
    staleTime: 60_000,
  })

  const handleRunCortex = async () => {
    setIsLoading(true)
    setRunError(null)
    setResult(null)
    try {
      const res = await fetch("/api/cortex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName, sqlCode, task, cortexModel, warehouse: config?.warehouse }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setResult(data as CortexAuditResponse)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopy = () => {
    if (!result) return
    navigator.clipboard.writeText(result.output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AuditFlow
      title="Snowflake Cortex"
      description={<HeaderText mono icon={<BrainCircuit className="h-5 w-5" aria-hidden />}>CORTEX_AI_INFRASTRUCTURE</HeaderText>}
      inputs={
        <div className="space-y-4 font-mono text-xs">
          {!config && <div className="p-6 border border-dashed rounded-xs text-muted-foreground">No connection configured. Open Connection Config to choose a warehouse, database and schema.</div>}
          <div className="p-3 border rounded-xs bg-muted/20 text-muted-foreground">Read-only metadata checks plus an explicit Cortex inference runner. Inference uses Snowflake credits only when you press execute.</div>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 rounded-xs border bg-muted/30">Warehouse: {config?.warehouse ?? "not configured"}</span>
            <span className="px-2 py-1 rounded-xs border bg-muted/30">Task: {task}</span>
            <span className="px-2 py-1 rounded-xs border bg-muted/30">Model: {cortexModel}</span>
          </div>
        </div>
      }
      evaluation={
        <div className="space-y-4">
          {infraError && <div className="p-4 border border-destructive/30 bg-destructive/10 rounded-xs text-xs text-destructive break-words">Could not read Cortex metadata: {(infraError as Error).message}</div>}
          {infraLoading && <div className="p-12 text-center space-y-3 font-mono"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /><p className="text-xs text-muted-foreground">RUNNING SHOW CORTEX SEARCH SERVICES / SHOW SEMANTIC VIEWS...</p></div>}
          {infraData && <CortexInfraPanel data={infraData} />}
        </div>
      }
      risk={
        <div className="space-y-4 font-mono">
          <div className="flex items-center gap-1 overflow-x-auto text-xs bg-muted/30 p-1 border rounded-xs">
            {[
              { id: "document" as CortexTask, label: "AUTO_DOCUMENTATION" },
              { id: "explain" as CortexTask, label: "SQL_PLAIN_EXPLAINER" },
              { id: "audit_anti_patterns" as CortexTask, label: "ANTI_PATTERN_REVIEW" },
              { id: "generate_unit_tests" as CortexTask, label: "DBT_UNIT_TESTS" },
            ].map((t) => <button key={t.id} onClick={() => setTask(t.id)} className={`px-2.5 py-1 rounded-xs text-[11px] transition-all ${task === t.id ? "bg-zinc-800 text-white font-bold" : "text-muted-foreground hover:text-foreground"}`}>{t.label}</button>)}
          </div>
          <div className="p-4 bg-card border border-border rounded-xs space-y-3">
            <div className="flex items-center justify-between"><span className="text-xs font-bold">MODEL_INPUT</span><select value={cortexModel} onChange={(e) => setCortexModel(e.target.value as CortexModel)} className="text-xs bg-muted border border-border rounded-xs px-2 py-0.5 font-mono">{CORTEX_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
            <label className="text-[10px] text-muted-foreground block">TARGET MODEL NAME<input type="text" value={modelName} onChange={(e) => setModelName(e.target.value)} className="w-full mt-1 text-xs font-mono p-2 border border-border rounded-xs bg-background" /></label>
            <label className="text-[10px] text-muted-foreground block">SQL CODE<textarea value={sqlCode} onChange={(e) => setSqlCode(e.target.value)} rows={13} className="w-full mt-1 text-xs font-mono p-3 border border-border rounded-xs bg-slate-950 text-slate-100" /></label>
            {(locked !== false || config?.demo) && <p className="text-muted-foreground">Demo: no Snowflake connection, so live analysis is disabled.</p>}
            <Button onClick={handleRunCortex} disabled={isLoading || !sqlCode || locked !== false || !!config?.demo} className="w-full h-8 text-xs bg-primary hover:bg-primary/90 text-white font-mono rounded-xs">{isLoading ? "RUNNING CORTEX INFERENCE..." : "EXECUTE CORTEX ANALYSIS"}</Button>
          </div>
        </div>
      }
      recommendations={
        <div className="p-4 bg-card border border-border rounded-xs flex flex-col space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-border pb-2"><span className="text-xs font-bold">CORTEX_OUTPUT {result && `[${result.modelUsed} • ${result.latencyMs}ms]`}</span>{result && <Button variant="outline" size="sm" onClick={handleCopy} className="h-6 text-[11px] font-mono px-2 rounded-xs">{copied ? "COPIED" : "COPY OUTPUT"}</Button>}</div>
          {runError && !isLoading && <div className="p-4 border border-destructive/30 bg-destructive/10 rounded-xs text-xs text-destructive break-words">{runError}</div>}
          {!result && !isLoading && !runError && <div className="p-8 border border-dashed border-border rounded-xs text-xs text-muted-foreground text-center">Select a task and execute Cortex analysis to produce a recommendation.</div>}
          {isLoading && <div className="p-8 text-xs text-muted-foreground text-center"><Loader2 className="h-5 w-5 animate-spin text-primary mr-2 inline" /> EXECUTING SNOWFLAKE.CORTEX.COMPLETE...</div>}
          {result && !isLoading && <pre className="p-3 bg-slate-950 text-slate-100 rounded-xs font-mono text-xs overflow-auto max-h-[460px] whitespace-pre-wrap leading-relaxed">{result.output}</pre>}
        </div>
      }
      evidence={<div className="p-4 border rounded-xs font-mono text-xs text-muted-foreground">Audit evidence: metadata is read with the configured account and the inference response is returned with the selected model and latency. No output is persisted by this page.</div>}
    />
  )
}
