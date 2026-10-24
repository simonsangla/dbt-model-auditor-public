"use client"

import { useState, useEffect, useCallback } from "react"
import { StepIndicator } from "@/components/step-indicator"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Warehouse, Database, Layers, GitBranch, ChevronRight, ChevronLeft, Loader2, Sparkles } from "lucide-react"
import { type AuditConfig, CONFIG_KEY } from "@/lib/config"
import { usePublicMode } from "@/lib/use-public-mode"
import { SNAPSHOT_CONFIG, SNAPSHOT_SOURCE } from "@/lib/audit-snapshot"

interface NamedItem {
  name: string
  comment?: string
  state?: string
  size?: string
  kind?: string
}

export default function SetupPage() {
  const router = useRouter()
  const locked = usePublicMode()
  const [step, setStep] = useState(0)
  const [config, setConfig] = useState<AuditConfig>({
    warehouse: "",
    database: "",
    schema: "",
    githubRepo: "",
  })

  const [warehouses, setWarehouses] = useState<NamedItem[]>([])
  const [databases, setDatabases] = useState<NamedItem[]>([])
  const [schemas, setSchemas] = useState<NamedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  // Snowflake is queried only after an explicit click, never on page load.
  const [connected, setConnected] = useState(false)

  // The public deploy is demo-only: /setup has nothing to configure there.
  useEffect(() => {
    if (locked) handleLoadDemoTemplate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked])

  // Load existing config if present
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONFIG_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as AuditConfig
        setConfig(parsed)
      }
    } catch {
      // ignore
    }
  }, [])

  const fetchItems = useCallback(async (url: string): Promise<NamedItem[]> => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      return data.warehouses ?? data.databases ?? data.schemas ?? []
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fetch failed")
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch warehouses on step 0
  useEffect(() => {
    if (step === 0 && connected && warehouses.length === 0) {
      fetchItems("/api/setup/warehouses").then(setWarehouses)
    }
  }, [step, connected, warehouses.length, fetchItems])

  // Fetch databases on step 1
  useEffect(() => {
    if (step === 1 && databases.length === 0) {
      fetchItems("/api/setup/databases").then(setDatabases)
    }
  }, [step, databases.length, fetchItems])

  // Fetch schemas when database changes
  useEffect(() => {
    if (step === 2 && config.database) {
      setSchemas([])
      fetchItems(`/api/setup/schemas?db=${encodeURIComponent(config.database)}`).then(setSchemas)
    }
  }, [step, config.database, fetchItems])

  function canProceed(): boolean {
    switch (step) {
      case 0: return !!config.warehouse
      case 1: return !!config.database
      case 2: return !!config.schema
      case 3: return true
      default: return false
    }
  }

  function handleFinish() {
    // A real connection is never a demo, even if the wizard was pre-filled from one.
    const { demo: _demo, ...real } = config
    localStorage.setItem(CONFIG_KEY, JSON.stringify(real))
    router.push("/")
  }

  function handleLoadDemoTemplate() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(SNAPSHOT_CONFIG))
    router.push("/")
  }

  const steps = [
    {
      icon: <Warehouse className="h-5 w-5" />,
      title: "Select Warehouse",
      description: "Pick the warehouse for running audit queries.",
      content: (
        <div className="space-y-3">
          {!connected && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <span className="text-muted-foreground">Warehouses are listed by a read-only Snowflake query.</span>
              <Button size="sm" onClick={() => setConnected(true)}>
                Load warehouses
              </Button>
            </div>
          )}
          <Label>Warehouse</Label>
          <Select value={config.warehouse} onValueChange={(v) => setConfig({ ...config, warehouse: v })}>
            <SelectTrigger>
              <SelectValue placeholder={!connected ? "Load warehouses first" : loading ? "Loading..." : "Select a warehouse"} />
            </SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.name} value={w.name}>
                  <span className="flex items-center gap-2">
                    {w.name}
                    <Badge variant="outline" className="text-xs">{w.size}</Badge>
                    <Badge variant={w.state === "STARTED" ? "default" : "secondary"} className="text-xs">
                      {w.state}
                    </Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ),
    },
    {
      icon: <Database className="h-5 w-5" />,
      title: "Select Database",
      description: "Choose the database containing your dbt models.",
      content: (
        <div className="space-y-3">
          <Label>Database</Label>
          <Select value={config.database} onValueChange={(v) => setConfig({ ...config, database: v, schema: "" })}>
            <SelectTrigger>
              <SelectValue placeholder={loading ? "Loading..." : "Select a database"} />
            </SelectTrigger>
            <SelectContent>
              {databases.map((d) => (
                <SelectItem key={d.name} value={d.name}>
                  <span className="flex items-center gap-2">
                    {d.name}
                    {d.comment && <span className="text-xs text-muted-foreground">{d.comment}</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ),
    },
    {
      icon: <Layers className="h-5 w-5" />,
      title: "Select Schema",
      description: "Pick the schema where your dbt models live.",
      content: (
        <div className="space-y-3">
          <Label>Schema in {config.database}</Label>
          <Select value={config.schema} onValueChange={(v) => setConfig({ ...config, schema: v })}>
            <SelectTrigger>
              <SelectValue placeholder={loading ? "Loading..." : "Select a schema"} />
            </SelectTrigger>
            <SelectContent>
              {schemas.map((s) => (
                <SelectItem key={s.name} value={s.name}>
                  <span className="flex items-center gap-2">
                    {s.name}
                    {s.comment && <span className="text-xs text-muted-foreground">{s.comment}</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ),
    },
    {
      icon: <GitBranch className="h-5 w-5" />,
      title: "GitHub Repository (optional)",
      description: "Link a GitHub repo to scan for dbt project files and coverage metrics.",
      content: (
        <div className="space-y-3">
          <Label>GitHub repo (owner/name)</Label>
          <Input
            placeholder="e.g. dbt-labs/jaffle-shop-classic"
            value={config.githubRepo ?? ""}
            onChange={(e) => setConfig({ ...config, githubRepo: e.target.value || undefined })}
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to skip GitHub integration. Pre-fills standard open template <code className="bg-muted px-1 rounded">dbt-labs/jaffle-shop-classic</code>.
          </p>
        </div>
      ),
    },
  ]

  const currentStep = steps[step]

  return (
    <main className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 py-12 space-y-4">
      <Card className="w-full max-w-lg shadow-md">
        <CardHeader>
          <div className="mb-2 flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">No Snowflake at hand?</p>
              <p className="text-xs text-muted-foreground">
                Open a real audit of the public jaffle-shop project, recorded {SNAPSHOT_SOURCE.recordedAt.slice(0, 10)}. Instant, runs no query.
              </p>
            </div>
            <Button size="sm" onClick={handleLoadDemoTemplate} className="shrink-0 gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Open recorded audit
            </Button>
          </div>
          <StepIndicator current={step} total={steps.length} />
          <CardTitle className="text-xl flex items-center gap-2">
            {currentStep.icon}
            {currentStep.title}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{currentStep.description}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          {loading && !error ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Querying Snowflake...
            </div>
          ) : (
            currentStep.content
          )}

          <div className="flex justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={step === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>

            {step < steps.length - 1 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleFinish} disabled={!canProceed()}>
                Start Auditing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
