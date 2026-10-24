"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  GitBranch,
  GitPullRequest,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderTree,
  FileCode,
  ExternalLink,
  Sparkles,
} from "lucide-react"
import { type AuditConfig, CONFIG_KEY } from "@/lib/config"

interface GitHubWizardProps {
  initialRepo?: string
  onRepoSaved?: (repo: string) => void
}

interface ScanResult {
  repo: string
  defaultBranch?: string
  openPrCount?: number
  modelCount?: number
  schemaCount?: number
  recentFiles?: Array<{ path: string; name: string }>
}

export function GitHubWizard({ initialRepo = "", onRepoSaved }: GitHubWizardProps) {
  const [repo, setRepo] = useState(initialRepo)
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  const handleScan = async (repoToScan: string) => {
    if (!repoToScan || !repoToScan.includes("/")) {
      setError("Please enter a valid repo in format 'owner/name' (e.g. dbt-labs/jaffle-shop-classic)")
      return
    }

    setIsScanning(true)
    setError(null)

    try {
      const res = await fetch(`/api/github?repo=${encodeURIComponent(repoToScan)}`)
      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to scan GitHub repository")
      }

      setScanResult({
        repo: repoToScan,
        defaultBranch: data.defaultBranch || "main",
        openPrCount: data.openPrs?.length || 0,
        modelCount: data.models?.length || 0,
        schemaCount: data.schemaFiles?.length || 0,
        recentFiles: (data.models || []).slice(0, 5),
      })

      // Save to localStorage
      try {
        const saved = localStorage.getItem(CONFIG_KEY)
        if (saved) {
          const cfg = JSON.parse(saved) as AuditConfig
          cfg.githubRepo = repoToScan
          localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
        }
      } catch {
        // ignore
      }

      if (onRepoSaved) onRepoSaved(repoToScan)
    } catch (err) {
      setError(err instanceof Error ? err.message : "GitHub scan failed")
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-indigo-500" />
              GitHub Connector Wizard
            </CardTitle>
            <CardDescription className="text-xs">
              Connect your remote dbt repository to scan models, review open PRs, and cross-reference SQL files.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            dbt Cloud & Core
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-xs">GitHub Repository (owner/repo)</Label>
          <div className="flex items-center gap-2">
            <Input
              placeholder="e.g. dbt-labs/jaffle-shop-classic"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="text-xs font-mono h-9"
            />
            <Button
              size="sm"
              onClick={() => handleScan(repo)}
              disabled={isScanning || !repo}
              className="h-9 text-xs px-4"
            >
              {isScanning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Scanning...
                </>
              ) : (
                "Scan Repo"
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                const sampleRepo = "dbt-labs/jaffle-shop-classic"
                setRepo(sampleRepo)
                handleScan(sampleRepo)
              }}
              className="text-[11px] text-primary hover:underline flex items-center gap-1"
            >
              <Sparkles className="h-3 w-3 text-amber-500" />
              Use default open template (dbt-labs/jaffle-shop-classic)
            </button>
            <span className="text-[11px] text-muted-foreground">
              Optional GITHUB_TOKEN in .env.local
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-xs text-destructive dark:text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {scanResult && !error && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-primary dark:text-primary flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Connected to {scanResult.repo}
              </span>
              <a
                href={`https://github.com/${scanResult.repo}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                View on GitHub <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 bg-muted/40 rounded-lg border">
                <div className="text-muted-foreground text-[10px]">Default Branch</div>
                <div className="font-semibold font-mono text-sm">{scanResult.defaultBranch}</div>
              </div>
              <div className="p-2.5 bg-muted/40 rounded-lg border">
                <div className="text-muted-foreground text-[10px]">Open PRs</div>
                <div className="font-semibold font-mono text-sm">{scanResult.openPrCount}</div>
              </div>
              <div className="p-2.5 bg-muted/40 rounded-lg border">
                <div className="text-muted-foreground text-[10px]">Detected Models</div>
                <div className="font-semibold font-mono text-sm text-indigo-500">
                  {scanResult.modelCount}
                </div>
              </div>
            </div>

            {scanResult.recentFiles && scanResult.recentFiles.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                  <FolderTree className="h-3.5 w-3.5" /> Scanned Model Files:
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                  {scanResult.recentFiles.map((file, i) => (
                    <div
                      key={i}
                      className="text-xs font-mono p-1.5 bg-muted/30 rounded flex items-center justify-between text-muted-foreground"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <FileCode className="h-3 w-3 text-indigo-500 shrink-0" />
                        {file.path || file.name}
                      </span>
                    </div>
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
