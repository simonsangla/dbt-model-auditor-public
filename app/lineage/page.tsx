"use client"

import { Suspense, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { FindingsTable } from "@/components/findings-table"
import { LineageMap } from "@/components/lineage-map"
import type { AuditFinding, AuditResult, ModelInfo } from "@/lib/audit-engine"
import type { DbtManifest } from "@/lib/manifest-parser"
import { replaySnapshot, SNAPSHOT_MANIFEST } from "@/lib/audit-snapshot"
import { matchInventoryToManifest, scopeAuditToDbt } from "@/lib/dbt-identity"
import { REVENUE_VARIANCE_FINDINGS, REVENUE_VARIANCE_MANIFEST, REVENUE_VARIANCE_RULE_FINDINGS, REVENUE_VARIANCE_SOURCE } from "@/lib/revenue-variance-sample"
import { joinRuntimeEvidence, runManifestRules } from "@/lib/manifest-rules"
import { buildLineageNodes, countEdges } from "@/lib/lineage-graph"

type SampleId = "jaffle" | "revenue"

const SAMPLES: { id: SampleId; label: string }[] = [
  { id: "jaffle", label: "Jaffle shop" },
  { id: "revenue", label: "dbt revenue variance demo" },
]

function LineagePageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const sample: SampleId = params.get("sample") === "revenue" ? "revenue" : "jaffle"

  // Jaffle: replay of the recorded real Snowflake run (no live query).
  const { data: snapshot } = useQuery<AuditResult>({
    queryKey: ["audit-snapshot"],
    queryFn: replaySnapshot,
    enabled: sample === "jaffle",
    staleTime: Infinity,
  })

  const view = useMemo((): { models: ModelInfo[]; findings: AuditFinding[]; manifest: DbtManifest; caption: string } | null => {
    if (sample === "revenue") {
      return {
        models: [],
        findings: [...REVENUE_VARIANCE_FINDINGS, ...REVENUE_VARIANCE_RULE_FINDINGS],
        manifest: REVENUE_VARIANCE_MANIFEST,
        caption: `Manifest of ${REVENUE_VARIANCE_SOURCE.project} (${REVENUE_VARIANCE_SOURCE.adapter}), manifest heuristics only.`,
      }
    }
    if (!snapshot) return null
    const scope = matchInventoryToManifest(snapshot.models, SNAPSHOT_MANIFEST, snapshot.config)
    const data = scope.targetedCount > 0 ? scopeAuditToDbt(snapshot, scope) : snapshot
    return {
      models: data.models,
      findings: joinRuntimeEvidence(runManifestRules(SNAPSHOT_MANIFEST, snapshot.models), data.findings),
      manifest: SNAPSHOT_MANIFEST,
      caption: "Recorded real Snowflake audit of the public jaffle-shop project, replayed locally; manifest rules joined to the Snowflake evidence.",
    }
  }, [sample, snapshot])

  const kpis = useMemo(() => {
    if (!view) return null
    const { nodes } = buildLineageNodes(view.models, view.findings, view.manifest)
    const sev = (s: string) => view.findings.filter((f) => f.severity === s).length
    return {
      models: nodes.filter((n) => n.type === "model").length,
      sources: nodes.filter((n) => n.type === "source").length,
      edges: countEdges(nodes),
      error: sev("error"),
      warning: sev("warning"),
      info: sev("info"),
    }
  }, [view])

  const select = (id: SampleId) => router.replace(`/lineage?sample=${id}`, { scroll: false })

  return (
    <main className="w-full py-6 px-4 space-y-5" data-testid="lineage-page">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">dbt lineage audit</h1>
          <p className="text-sm text-muted-foreground">{view?.caption ?? "Loading sample..."}</p>
        </div>
        <div role="tablist" aria-label="Sample" className="inline-flex rounded-lg bg-muted/60 p-1 text-xs" data-testid="lineage-sample-toggle">
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={sample === s.id}
              data-testid={`lineage-sample-${s.id}`}
              onClick={() => select(s.id)}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                sample === s.id ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="lineage-kpis">
          {[
            { label: "Models", value: kpis.models, tone: "" },
            { label: "Sources", value: kpis.sources, tone: "" },
            { label: "Edges", value: kpis.edges, tone: "" },
            { label: "Errors", value: kpis.error, tone: "text-destructive" },
            { label: "Warnings", value: kpis.warning, tone: "text-amber-600 dark:text-amber-400" },
            { label: "Info", value: kpis.info, tone: "text-sky-600 dark:text-sky-400" },
          ].map((k) => (
            <Card key={k.label} className="shadow-sm">
              <CardContent className="py-3 px-4">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
                <div className={`text-2xl font-semibold tabular-nums ${k.tone}`} data-testid={`kpi-${k.label.toLowerCase()}`}>
                  {k.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {view && (
        <>
          <LineageMap key={sample} models={view.models} findings={view.findings} manifest={view.manifest} />
          <FindingsTable findings={view.findings} />
        </>
      )}
    </main>
  )
}

export default function LineagePage() {
  return (
    <Suspense fallback={null}>
      <LineagePageInner />
    </Suspense>
  )
}
