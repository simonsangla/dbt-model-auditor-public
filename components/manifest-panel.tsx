"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileCode, UploadCloud, CheckCircle2, AlertTriangle, Sparkles, RotateCcw } from "lucide-react"
import { type ManifestAuditSummary, type DbtManifest, auditDbtManifest } from "@/lib/manifest-parser"
import { SNAPSHOT_MANIFEST, SNAPSHOT_SOURCE } from "@/lib/audit-snapshot"

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
            Drop in your dbt <code className="bg-muted px-1 py-0.5 rounded">target/manifest.json</code> or load the recorded jaffle-shop manifest to instantly check naming conventions, test coverage, and direct source join violations.
          </p>
        )}

        {summary && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
