"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { AuditScoreCard } from "@/components/audit-score-card"
import { FindingsTable } from "@/components/findings-table"
import { ModelsTable } from "@/components/models-table"
import { AuditFlow } from "@/components/audit-flow"
import { GitHubPanel } from "@/components/github-panel"
import { GitHubWizard } from "@/components/github-wizard"
import { ManifestPanel } from "@/components/manifest-panel"
import { LineageMap } from "@/components/lineage-map"
import { ExportReportButton } from "@/components/export-report-button"
import { Button } from "@/components/ui/button"
import { Settings, Database, Sparkles, GitBranch, Loader2 } from "lucide-react"
import { CheckStatusList } from "@/components/check-status-list"
import { type AuditConfig, CONFIG_KEY, configToParams } from "@/lib/config"
import type { AuditResult } from "@/lib/audit-engine"
import type { DbtManifest } from "@/lib/manifest-parser"
import { HeaderMeta, HeaderChip } from "@/components/audit-header-meta"
import { usePublicMode } from "@/lib/use-public-mode"
import { replaySnapshot, SNAPSHOT_CONFIG, SNAPSHOT_MANIFEST, SNAPSHOT_SOURCE } from "@/lib/audit-snapshot"
import { matchInventoryToManifest, scopeAuditToDbt } from "@/lib/dbt-identity"
import { DbtScopePanel } from "@/components/dbt-scope-panel"

export default function Home() {
  const router = useRouter()
  const [config, setConfig] = useState<AuditConfig | null>(null)
  const [manifest, setManifest] = useState<DbtManifest | null>(null)
  const [showGithubWizard, setShowGithubWizard] = useState(false)
  const [loading, setLoading] = useState(true)

  const locked = usePublicMode()

  useEffect(() => {
    if (locked === null) return
    try {
      const saved = localStorage.getItem(CONFIG_KEY)
      const parsed = saved ? (JSON.parse(saved) as AuditConfig) : null
      // The recorded demo is the default: no saved config, a saved demo, or a public lock all open it.
      setConfig(!parsed || parsed.demo || locked ? SNAPSHOT_CONFIG : parsed)
    } catch {
      setConfig(SNAPSHOT_CONFIG)
    }
    setLoading(false)
  }, [locked])

  const params = config ? configToParams(config).toString() : ""

  const isDemo = config?.demo === true
  const { data: auditData, error: auditError, isLoading: auditLoading } = useQuery<AuditResult>({
    queryKey: ["audit", params],
    queryFn: async () => {
      const res = await fetch(`/api/audit?${params}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      return body
    },
    enabled: !!config && !isDemo,
    retry: false,
    staleTime: 60_000,
  })

  // The demo replays a recorded real run through the current engine: no Snowflake query.
  const { data: snapshotData } = useQuery<AuditResult>({
    queryKey: ["audit-snapshot"],
    queryFn: replaySnapshot,
    enabled: isDemo,
    staleTime: Infinity,
  })

  // The recorded run is shown ONLY in the explicitly chosen demo, never as a fallback for a failed audit.
  const rawData = isDemo ? snapshotData : auditData
  const displayManifest = manifest ?? (isDemo ? SNAPSHOT_MANIFEST : null)
  // With a manifest that builds into this schema, the audit covers dbt models only.
  const scope = rawData && displayManifest ? matchInventoryToManifest(rawData.models, displayManifest, rawData.config) : null
  const displayData = rawData && scope && scope.targetedCount > 0 ? scopeAuditToDbt(rawData, scope) : rawData

  const handleRepoSaved = (newRepo: string) => {
    if (config) {
      setConfig({ ...config, githubRepo: newRepo })
    }
    setShowGithubWizard(false)
  }

  if (loading) return null

  if (!config) {
    return (
      <main className="w-full py-8 px-4 max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">dbt Model Auditor</h1>
        <p className="text-sm text-muted-foreground">
          No Snowflake connection is configured. Choose a warehouse, database and schema to audit, or open the
          recorded real audit of the public jaffle-shop project.
        </p>
        <Button onClick={() => router.push("/setup")} className="text-xs gap-1.5">
          <Settings className="h-3.5 w-3.5" /> Configure connection
        </Button>
      </main>
    )
  }

  return (
    <AuditFlow
      title="dbt Model Auditor"
      description={
        <HeaderMeta>
          <Database className="h-4 w-4" aria-hidden />
          <HeaderChip mono>{config.database}.{config.schema}</HeaderChip>
          <span>on</span>
          <HeaderChip variant="solid" mono>{config.warehouse}</HeaderChip>
          {isDemo && (
            <HeaderChip variant="notice" icon={<Sparkles className="h-3 w-3" aria-hidden />}>Recorded run</HeaderChip>
          )}
        </HeaderMeta>
      }
      inputs={
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <ExportReportButton
              data={displayData}
              scope={
                scope && scope.targetedCount > 0
                  ? `dbt models only (${scope.dbtModels.length} matched through manifest.json)`
                  : "all tables and views in the schema (no manifest matched)"
              }
            />
            {locked === false && !isDemo && (
              <>
            <Button variant="outline" size="sm" onClick={() => setShowGithubWizard(!showGithubWizard)} className="text-xs gap-1.5">
              <GitBranch className="h-3.5 w-3.5 text-indigo-500" />
              {showGithubWizard ? "Close GitHub" : "GitHub Setup"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push("/setup")} className="text-xs">
              <Settings className="h-3.5 w-3.5 mr-1" /> Reconfigure
            </Button>
            {!config.githubRepo && !showGithubWizard && (
              <Button variant="ghost" size="sm" onClick={() => setShowGithubWizard(true)} className="text-xs text-indigo-500 gap-1">
                <GitBranch className="h-3 w-3" /> + Connect GitHub Repo
              </Button>
            )}
              </>
            )}
          </div>
          {showGithubWizard && locked === false && <GitHubWizard initialRepo={config.githubRepo || ""} onRepoSaved={handleRepoSaved} />}
          {config.githubRepo && !showGithubWizard && locked === false && !isDemo && <GitHubPanel params={params} />}
          <ManifestPanel onManifestChange={setManifest} preloaded={isDemo || locked !== false} />
          {isDemo && (
            <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200">
              Recorded run: a real audit of the public dbt project {SNAPSHOT_SOURCE.project} ({SNAPSHOT_SOURCE.commit}), run
              on Snowflake on {SNAPSHOT_SOURCE.recordedAt.slice(0, 10)} and replayed here by the current audit engine. Viewing
              this page runs no query.{locked === false && " Reconfigure to audit your own schema."}
              {SNAPSHOT_SOURCE.renamed && " Database and warehouse names are replaced with neutral ones."}
              {SNAPSHOT_SOURCE.seeded.length > 0 && <span className="mt-1 block">Defects added on purpose for the demo: {SNAPSHOT_SOURCE.seeded.join("; ")}.</span>}
            </div>
          )}
        </div>
      }
      evaluation={
        <div className="space-y-6">
          {auditLoading && !isDemo && <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Running audit...</div>}
          {auditError && !isDemo && <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/10 text-sm text-destructive break-words">Audit failed: {(auditError as Error).message}</div>}
          {rawData && <DbtScopePanel scope={scope} target={`${rawData.config.database}.${rawData.config.schema}`} totalObjects={rawData.models.length} />}
          {displayData && <AuditScoreCard data={displayData} unit={scope && scope.targetedCount > 0 ? "dbt models" : "tables and views"} />}
          {displayData && displayData.checks.length > 0 && <CheckStatusList checks={displayData.checks} />}
        </div>
      }
      risk={<LineageMap models={displayData?.models} findings={displayData?.findings} manifest={displayManifest} />}
      recommendations={<FindingsTable findings={displayData?.findings ?? []} />}
      evidence={<ModelsTable models={displayData?.models ?? []} />}
    />
  )
}
