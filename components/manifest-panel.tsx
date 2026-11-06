"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileCode, UploadCloud, CheckCircle2, AlertTriangle, Sparkles, RotateCcw } from "lucide-react"
import { type ManifestAuditSummary, type DbtManifest, auditDbtManifest } from "@/lib/manifest-parser"
import { SHARED_MEANING_META_KEY, type SharedColumnGroup } from "@/lib/column-semantics"
import { SNAPSHOT_MANIFEST, SNAPSHOT_SOURCE } from "@/lib/audit-snapshot"

/**
 * Columns sharing a name and a description across models. Each group FAILS until a
 * human confirms every column with meta.shared_meaning_confirmed: true; the panel
 * never assumes the columns mean the same thing. Pure: rendered from the summary.
 */
export function SharedColumnsBlock({ groups, coveragePct }: { groups: SharedColumnGroup[]; coveragePct: number | null }) {
  const confirmed = groups.filter((g) => g.confirmed).length
  const pending = groups.filter((g) => !g.confirmed)
  return (
    <>
      <div className="p-3 bg-muted/40 rounded-lg" data-testid="shared-column-coverage">
        <div className="text-xs text-muted-foreground">Shared Columns Confirmed</div>
        <div className={`text-xl font-bold ${pending.length > 0 ? "text-amber-500" : "text-primary"}`}>
          {coveragePct === null ? "n/a" : `${coveragePct}%`}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {groups.length === 0 ? "no column shares name + description across models" : `${confirmed}/${groups.length} groups confirmed in meta`}
        </div>
      </div>
      {pending.length > 0 && (
        <div className="space-y-1 col-span-2 md:col-span-5" data-testid="shared-columns-to-confirm">
          <div className="text-xs font-semibold text-amber-500 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            FAILED until confirmed: {pending.length} shared-column group{pending.length === 1 ? "" : "s"} (same name and description, meaning not confirmed; does not change the score)
          </div>
          <div className="text-xs text-muted-foreground bg-amber-500/10 p-2 rounded max-h-32 overflow-auto space-y-1">
            {pending.map((g) => (
              <div key={`${g.column}:${g.description}`}>
                • <code>{g.column}</code> in {g.models.map((m, i) => (
                  <span key={m}>
                    {i > 0 && ", "}
                    <code>{m}</code>
                    {g.confirmedBy.includes(m) ? " (confirmed)" : ""}
                  </span>
                ))}
                {g.docBlock ? <> — text from doc block <code>{g.docBlock}</code></> : null}
                {" "}— confirm with the owners, then set <code>meta.{SHARED_MEANING_META_KEY}: true</code> on each column
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

interface ManifestPanelProps {
  onManifestChange?: (manifest: DbtManifest | null) => void
  /** Demo: the recorded manifest loads on mount and there is no upload, load or reset control. */
  preloaded?: boolean
}

export function ManifestPanel({ onManifestChange, preloaded = false }: ManifestPanelProps) {
  const [summary, setSummary] = useState<ManifestAuditSummary | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedSource, setLoadedSource] = useState<string | null>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessing(true)
    setError(null)

    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string
        const json = JSON.parse(text)
        const res = await fetch("/api/manifest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(json),
        })
        if (!res.ok) {
          const errData = await res.json()
          throw new Error(errData.error || "Failed to process manifest")
        }
        const data: ManifestAuditSummary = await res.json()
        setSummary(data)
        setLoadedSource(file.name)
        if (onManifestChange) onManifestChange(json as DbtManifest)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Invalid manifest JSON")
      } finally {
        setIsProcessing(false)
      }
    }
    reader.readAsText(file)
  }

  const handleLoadSample = () => {
    setIsProcessing(true)
    setError(null)
    try {
      const summaryData = auditDbtManifest(SNAPSHOT_MANIFEST)
      setSummary(summaryData)
      setLoadedSource(`${SNAPSHOT_SOURCE.project} (recorded ${SNAPSHOT_SOURCE.commit})`)
      if (onManifestChange) onManifestChange(SNAPSHOT_MANIFEST)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sample")
    } finally {
      setIsProcessing(false)
    }
  }

  useEffect(() => {
    if (preloaded) handleLoadSample()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloaded])

  const handleReset = () => {
    setSummary(null)
    setLoadedSource(null)
    setError(null)
    if (onManifestChange) onManifestChange(null)
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCode className="h-5 w-5 text-indigo-500" />
              dbt Manifest Heuristics (dbt-project-evaluator)
            </CardTitle>
            {loadedSource && (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                Loaded: <Badge variant="secondary" className="text-[10px] font-mono">{loadedSource}</Badge>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {preloaded ? null : !summary ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadSample}
                  disabled={isProcessing}
                  className="h-8 text-xs gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  Load recorded jaffle-shop
                </Button>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isProcessing}
                  />
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
                    <UploadCloud className="h-4 w-4" />
                    {isProcessing ? "Analyzing..." : "Upload manifest.json"}
                  </span>
                </label>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Manifest
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-xs text-destructive mb-2">{error}</p>}

        {!summary && !error && (
          <p className="text-xs text-muted-foreground">
            Drop in your dbt <code className="bg-muted px-1 py-0.5 rounded">target/manifest.json</code> or load the recorded jaffle-shop manifest to instantly check naming conventions, test coverage, direct source join violations, and columns that share a name and description across models without a confirmed meaning.
          </p>
        )}

        {summary && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3 bg-muted/40 rounded-lg">
                <div className="text-xs text-muted-foreground">Models Evaluated</div>
                <div className="text-xl font-bold">{summary.totalModels}</div>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg">
                <div className="text-xs text-muted-foreground">Test Coverage</div>
                <div className="text-xl font-bold text-primary">{summary.testCoveragePct}%</div>
                <div className="text-[10px] text-muted-foreground">{summary.testedModels}/{summary.totalModels} tested</div>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg">
                <div className="text-xs text-muted-foreground">Doc Coverage</div>
                <div className="text-xl font-bold text-indigo-500">{summary.docCoveragePct}%</div>
                <div className="text-[10px] text-muted-foreground">{summary.documentedModels}/{summary.totalModels} documented</div>
              </div>
              <div className="p-3 bg-muted/40 rounded-lg">
                <div className="text-xs text-muted-foreground">Source Join Violations</div>
                <div className={`text-xl font-bold ${summary.directSourceViolations.length > 0 ? "text-amber-500" : "text-primary"}`}>
                  {summary.directSourceViolations.length}
                </div>
              </div>
              <SharedColumnsBlock groups={summary.sharedColumnGroups ?? []} coveragePct={summary.sharedColumnCoveragePct ?? null} />
            </div>

            {summary.directSourceViolations.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-amber-500 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Direct Source Joins Found (dbt-project-evaluator violation):
                </div>
                <div className="text-xs text-muted-foreground bg-amber-500/10 p-2 rounded max-h-24 overflow-auto">
                  {summary.directSourceViolations.map((v, i) => (
                    <div key={i}>• Model <code>{v.model}</code> queries source <code>{v.source}</code> directly</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
