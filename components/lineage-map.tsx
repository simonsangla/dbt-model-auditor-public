"use client"

import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, type ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Layers,
  LayoutDashboard,
  Database,
  FileCode,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Search,
  Check,
  Copy,
  Terminal,
  Zap,
  Flame,
  X,
  Sparkles,
} from "lucide-react"
import type { AuditFinding, ModelInfo } from "@/lib/audit-engine"
import { generateFixSnippet } from "@/lib/audit-engine"
import type { DbtManifest } from "@/lib/manifest-parser"
import { THEME_TOKENS } from "@/lib/tokens"
import { buildLineageNodes, edgePath, isRiskyEdgeSource, propagationOf, selectNodes, type PipelineLayer } from "@/lib/lineage-graph"

export type { PipelineLayer, LineageNode } from "@/lib/lineage-graph"

interface LineageMapProps {
  models?: ModelInfo[]
  findings?: AuditFinding[]
  manifest?: DbtManifest | null
  onSelectModel?: (modelName: string) => void
}

interface LineageEdge {
  key: string
  from: string
  to: string
  d: string
}

const EDGE_STYLE = {
  up: { stroke: "#3b82f6", opacity: 0.9, width: 2 },
  down: { stroke: "#f59e0b", opacity: 0.9, width: 2 },
  idle: { stroke: "currentColor", opacity: 0.35, width: 1.25 },
  dim: { stroke: "currentColor", opacity: 0.08, width: 1 },
  risk: { stroke: "#dc2626", opacity: 0.85, width: 2 },
} as const

export function LineageMap({ models = [], findings = [], manifest, onSelectModel }: LineageMapProps) {
  const [search, setSearch] = useState("")
  const [filterHealth, setFilterHealth] = useState<"all" | "issues" | "error" | "warning" | "info" | "healthy">("all")
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [blastRadiusMode, setBlastRadiusMode] = useState(true)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // Build DAG nodes (pure helper: lib/lineage-graph.ts)
  const { nodes, stats } = useMemo(() => buildLineageNodes(models, findings, manifest), [models, findings, manifest])
  const nameOf = useCallback((id: string) => nodes.find((n) => n.id === id)?.name ?? id, [nodes])

  // Compute blast radius sets when a node is selected
  const { blastUpstream, blastDownstream } = useMemo(() => {
    if (!selectedNodeId) return { blastUpstream: new Set<string>(), blastDownstream: new Set<string>() }

    const nodeMap = new Map(nodes.map((n) => [n.id, n]))
    const upSet = new Set<string>()
    const downSet = new Set<string>()

    // Recursive upstream
    function walkUp(id: string) {
      const n = nodeMap.get(id)
      if (!n) return
      for (const dep of n.dependencies) {
        if (!upSet.has(dep)) {
          upSet.add(dep)
          walkUp(dep)
        }
      }
    }

    // Recursive downstream (Blast Radius)
    function walkDown(id: string) {
      const n = nodeMap.get(id)
      if (!n) return
      // dependents hold display names (UPPER for Snowflake models); the map is keyed by lower-case id.
      for (const dependent of n.dependents) {
        const dep = dependent.toLowerCase()
        if (!downSet.has(dep)) {
          downSet.add(dep)
          walkDown(dep)
        }
      }
    }

    walkUp(selectedNodeId)
    walkDown(selectedNodeId)

    return { blastUpstream: upSet, blastDownstream: downSet }
  }, [selectedNodeId, nodes])

  // A dbt graph-operator query ("+model", "model+", "+model+", "2+model") selects a
  // subgraph and focuses its root; anything else is a free-text search.
  const graphSelection = useMemo(() => selectNodes(nodes, search), [nodes, search])
  const focusRoot = graphSelection?.root ?? null
  useEffect(() => {
    if (focusRoot) setSelectedNodeId(focusRoot)
  }, [focusRoot])

  // Filtered nodes
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      const matchesSearch = graphSelection
        ? graphSelection.ids.has(n.id)
        : search === "" ||
        n.name.toLowerCase().includes(search.toLowerCase()) ||
        n.findings.some((f) => f.message.toLowerCase().includes(search.toLowerCase()))

      if (!matchesSearch) return false

      if (filterHealth === "issues") return n.health !== "healthy"
      if (filterHealth === "info") return n.health === "info"
      if (filterHealth === "error") return n.health === "error"
      if (filterHealth === "warning") return n.health === "warning"
      if (filterHealth === "healthy") return n.health === "healthy"
      return true
    })
  }, [nodes, search, filterHealth, graphSelection])

  const selectedNode = useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || null
  }, [nodes, selectedNodeId])

  // Edges are measured from the rendered cards so the SVG overlay follows the real
  // layout (column widths, per-column scroll, filters). They are drawn only on the
  // four-column layout; a same-column dependency loops out of the column's right side.
  const flowRef = useRef<HTMLDivElement>(null)
  const [edgePaths, setEdgePaths] = useState<LineageEdge[]>([])
  const [flowSize, setFlowSize] = useState({ w: 0, h: 0 })

  const measureEdges = useCallback(() => {
    const root = flowRef.current
    if (!root) return
    const box = root.getBoundingClientRect()
    // Props such as the default `models = []` are new on every render, so this runs
    // after each commit: only set state when the geometry actually changed, or the
    // layout effect would re-render forever.
    setFlowSize((prev) => (prev.w === box.width && prev.h === box.height ? prev : { w: box.width, h: box.height }))
    const commit = (next: LineageEdge[]) =>
      setEdgePaths((prev) =>
        prev.length === next.length && prev.every((e, i) => e.key === next[i].key && e.d === next[i].d) ? prev : next,
      )
    if (window.innerWidth < 1024) {
      commit([])
      return
    }
    const anchors = new Map<string, { x1: number; x2: number; y: number }>()
    root.querySelectorAll<HTMLElement>("[data-node-id]").forEach((el) => {
      const r = el.getBoundingClientRect()
      const y = r.top + r.height / 2
      // A card scrolled out of its column has no visible anchor: skip its edges.
      const viewport = el.closest("[data-layer-scroll]")?.getBoundingClientRect()
      if (viewport && (y < viewport.top || y > viewport.bottom)) return
      anchors.set(el.dataset.nodeId as string, { x1: r.left - box.left, x2: r.right - box.left, y: y - box.top })
    })
    const next: LineageEdge[] = []
    for (const node of filteredNodes) {
      const to = anchors.get(node.id)
      if (!to) continue
      for (const depId of node.dependencies) {
        const from = anchors.get(depId)
        const d = from ? edgePath(from, to) : null
        if (!d) continue
        next.push({ key: `${depId}->${node.id}`, from: depId, to: node.id, d })
      }
    }
    commit(next)
  }, [filteredNodes])

  useLayoutEffect(() => {
    measureEdges()
    const root = flowRef.current
    if (!root) return
    const observer = new ResizeObserver(() => measureEdges())
    observer.observe(root)
    root.addEventListener("scroll", measureEdges, true)
    window.addEventListener("resize", measureEdges)
    return () => {
      observer.disconnect()
      root.removeEventListener("scroll", measureEdges, true)
      window.removeEventListener("resize", measureEdges)
    }
  }, [measureEdges, selectedNodeId, blastRadiusMode])

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  // The exposures column appears only when the manifest declares at least one.
  const hasExposures = nodes.some((n) => n.type === "exposure")
  const layerKeys: PipelineLayer[] = hasExposures
    ? ["sources", "staging", "intermediate", "marts", "exposures"]
    : ["sources", "staging", "intermediate", "marts"]

  function edgeTone(e: LineageEdge): "up" | "down" | "idle" | "dim" | "risk" {
    const risky = isRiskyEdgeSource(nodeById.get(e.from))
    if (!selectedNodeId || !blastRadiusMode) return risky ? "risk" : "idle"
    const inUp = (id: string) => id === selectedNodeId || blastUpstream.has(id)
    const inDown = (id: string) => id === selectedNodeId || blastDownstream.has(id)
    if (inUp(e.from) && inUp(e.to)) return "up"
    if (inDown(e.from) && inDown(e.to)) return "down"
    return "dim"
  }

  const handleCopyFix = (snippet: string, index: number) => {
    navigator.clipboard.writeText(snippet)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  function formatBytes(bytes?: number) {
    if (!bytes) return "0 B"
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${bytes} B`
  }

  return (
    <Card className="border shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b bg-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary dark:text-primary" />
                Visual Pipeline Lineage & Blast Radius Map
              </CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">
              Layered by name prefix (Sources, Staging, Intermediate, Marts). Edges come only from an uploaded manifest.json and are drawn on wide screens; without a manifest, no dependencies are drawn.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={blastRadiusMode ? "default" : "outline"}
              size="sm"
              onClick={() => setBlastRadiusMode(!blastRadiusMode)}
              className={`text-xs gap-1.5 h-8 ${
                blastRadiusMode ? "bg-primary hover:bg-primary/90 text-white" : ""
              }`}
            >
              <Flame className="h-3.5 w-3.5 text-amber-300" />
              Blast Radius Mode {blastRadiusMode ? "ON" : "OFF"}
            </Button>

            <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg text-xs">
              <button
                onClick={() => setFilterHealth("all")}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  filterHealth === "all" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({stats.total})
              </button>
              <button
                onClick={() => setFilterHealth("issues")}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  filterHealth === "issues" ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ⚠️ Issues ({stats.errorCount + stats.warningCount + stats.infoCount})
              </button>
              <button
                onClick={() => setFilterHealth("healthy")}
                className={`px-2.5 py-1 rounded font-medium transition-colors ${
                  filterHealth === "healthy" ? "bg-primary/15 text-primary dark:text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                🟢 Healthy ({stats.healthyCount})
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search, or select like dbt: +model, model+, +model+"
              aria-label="Search models, or select a subgraph with dbt graph operators"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-xs"
            />
          </div>
          {search && (
            <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="h-9 px-2 text-xs">
              Clear
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 bg-muted/10 space-y-6">
        {/* Layer Pipeline Flow */}
        <div ref={flowRef} className="relative">
        <svg
          className="pointer-events-none absolute inset-0 z-10 overflow-visible text-muted-foreground"
          width={flowSize.w}
          height={flowSize.h}
          aria-hidden="true"
          data-testid="lineage-edges"
        >
          {edgePaths.map((e) => {
            const style = EDGE_STYLE[edgeTone(e)]
            return (
              <path
                key={e.key}
                d={e.d}
                fill="none"
                stroke={style.stroke}
                strokeOpacity={style.opacity}
                strokeWidth={style.width}
                data-edge-tone={edgeTone(e)}
              />
            )
          })}
        </svg>
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${hasExposures ? "lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,0.7fr)]" : "lg:grid-cols-4"}`}>
          {layerKeys.map((layerKey) => {
            const config = THEME_TOKENS.layers[layerKey]
            const layerNodes = filteredNodes.filter((n) => n.layer === layerKey)
            const layerIssues = layerNodes.reduce((acc, n) => acc + n.findings.length, 0)

            return (
              <div
                key={layerKey}
                className="flex flex-col rounded-xl border bg-card/75 backdrop-blur-xs p-3.5 space-y-3 min-h-80 shadow-2xs"
              >
                <div className="flex items-center justify-between pb-2 border-b">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                      {config.label}
                    </span>
                    <p className="text-[11px] text-muted-foreground">{config.description}</p>
                  </div>
                  {layerIssues > 0 ? (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] px-1.5 py-0 font-bold">
                      {layerIssues} {layerIssues === 1 ? "issue" : "issues"}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground px-1.5 py-0">
                      {layerNodes.length}
                    </Badge>
                  )}
                </div>

                <div data-layer-scroll className="space-y-2.5 flex-1 overflow-y-auto max-h-120 pr-1">
                  {layerNodes.length === 0 ? (
                    <div className="h-28 flex items-center justify-center text-xs text-muted-foreground text-center border border-dashed rounded-lg">
                      No models in this layer
                    </div>
                  ) : (
                    layerNodes.map((node) => {
                      const isSelected = selectedNodeId === node.id
                      const isBlastUp = blastRadiusMode && selectedNodeId && blastUpstream.has(node.id)
                      const isBlastDown = blastRadiusMode && selectedNodeId && blastDownstream.has(node.id)
                      const isDimmed = blastRadiusMode && selectedNodeId && !isSelected && !isBlastUp && !isBlastDown

                      let borderClass = "border-border hover:border-primary/60"
                      // An exposure carries no findings, so a health badge would only crowd its name.
                      let nodeBadge: ReactNode =
                        node.type === "exposure" ? null : (
                          <span className="flex items-center gap-1 text-[11px] text-primary dark:text-primary font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Healthy
                          </span>
                        )

                      if (node.health === "error") {
                        borderClass = "border-destructive/60 bg-destructive/5 hover:border-destructive"
                        nodeBadge = (
                          <span className="flex items-center gap-1 text-[11px] text-destructive dark:text-destructive font-bold shrink-0 whitespace-nowrap">
                            <AlertCircle className="h-3.5 w-3.5" /> {node.findings.filter((f) => f.severity === "error").length} Error
                          </span>
                        )
                      } else if (node.health === "warning") {
                        borderClass = "border-amber-500/50 bg-amber-500/5 hover:border-amber-600"
                        nodeBadge = (
                          <span className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 font-bold shrink-0 whitespace-nowrap">
                            <AlertTriangle className="h-3.5 w-3.5" /> {node.findings.filter((f) => f.severity === "warning").length} Warning
                          </span>
                        )
                      } else if (node.health === "info") {
                        borderClass = "border-sky-500/40 bg-sky-500/5 hover:border-sky-600"
                        nodeBadge = (
                          <span className="flex items-center gap-1 text-[11px] text-sky-700 dark:text-sky-300 font-semibold shrink-0 whitespace-nowrap">
                            <AlertCircle className="h-3.5 w-3.5" /> {node.findings.filter((f) => f.severity === "info").length} info
                          </span>
                        )
                      }

                      if (isSelected) {
                        borderClass = "ring-2 ring-primary ring-offset-2 border-primary shadow-md bg-primary/5"
                      } else if (isBlastDown) {
                        borderClass = "border-amber-500 ring-1 ring-amber-400 bg-amber-500/10 shadow-sm animate-pulse"
                      } else if (isBlastUp) {
                        borderClass = "border-blue-500 ring-1 ring-blue-400 bg-blue-500/10"
                      }

                      return (
                        <div
                          key={node.id}
                          data-node-id={node.id}
                          onClick={() => {
                            setSelectedNodeId(node.id === selectedNodeId ? null : node.id)
                            if (onSelectModel && node.type === "model") onSelectModel(node.name)
                          }}
                          className={`group cursor-pointer rounded-lg border p-3 transition-all relative ${borderClass} ${
                            isDimmed ? "opacity-35 hover:opacity-100" : "opacity-100"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {node.type === "source" ? (
                                  <Database className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                ) : node.type === "exposure" ? (
                                  <LayoutDashboard className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                                ) : (
                                  <FileCode className="h-3.5 w-3.5 text-primary dark:text-primary shrink-0" />
                                )}
                                <span className="text-xs font-mono font-semibold truncate text-foreground group-hover:text-primary" title={node.name}>
                                  {node.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                {node.kind === "VIEW" && <span>view</span>}
                                {node.rows !== undefined && (
                                  <span>{node.rows.toLocaleString()} rows</span>
                                )}
                                {node.bytes !== undefined && (
                                  <span>• {formatBytes(node.bytes)}</span>
                                )}
                              </div>
                            </div>
                            <div>{nodeBadge}</div>
                          </div>

                          {/* Blast Radius Pills */}
                          {isBlastDown && (
                            <div className="mt-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded flex items-center gap-1">
                              <Flame className="h-3 w-3" /> Blast Impact (Downstream)
                            </div>
                          )}
                          {isBlastUp && (
                            <div className="mt-1.5 text-[10px] font-medium text-blue-700 dark:text-blue-300 bg-blue-500/15 px-1.5 py-0.5 rounded flex items-center gap-1">
                              ⬅️ Upstream Source
                            </div>
                          )}

                          {/* In/Out connections */}
                          <div className="mt-2 pt-2 border-t flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>In: {node.dependencies.length}</span>
                            <span>Out: {node.dependents.length}</span>
                          </div>

                          {/* Attached Findings */}
                          {node.findings.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {node.findings.slice(0, 2).map((f, i) => (
                                <div
                                  key={i}
                                  className={`text-[10px] truncate rounded px-1.5 py-0.5 ${
                                    f.severity === "error"
                                      ? "bg-destructive/15 text-destructive dark:text-destructive font-medium"
                                      : "bg-amber-500/15 text-amber-800 dark:text-amber-200 font-medium"
                                  }`}
                                >
                                  • {f.message}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
        </div>

        {/* Selected Model Detail Inspector Card */}
        {selectedNode && (
          <div className="rounded-xl border bg-card p-5 space-y-5 shadow-lg animate-in fade-in-50 duration-200">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="uppercase text-[10px] tracking-wider font-mono">
                    {selectedNode.layer}
                  </Badge>
                  <h3 className="text-base font-bold font-mono text-foreground flex items-center gap-2">
                    {selectedNode.type === "source" ? (
                      <Database className="h-4 w-4 text-blue-500" />
                    ) : selectedNode.type === "exposure" ? (
                      <LayoutDashboard className="h-4 w-4 text-slate-500" />
                    ) : (
                      <FileCode className="h-4 w-4 text-primary dark:text-primary" />
                    )}
                    {selectedNode.name}
                  </h3>
                </div>
                {selectedNode.description && (
                  <p className="text-xs text-muted-foreground">{selectedNode.description}</p>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setSelectedNodeId(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-muted/40 p-3 rounded-lg border">
              <div>
                <span className="text-muted-foreground block text-[10px]">Materialization</span>
                <span className="font-semibold font-mono">{selectedNode.kind || (selectedNode.type === "source" ? "SOURCE" : "VIEW")}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Row Count</span>
                <span className="font-semibold font-mono">{selectedNode.rows?.toLocaleString() ?? (selectedNode.kind === "VIEW" ? "view" : "N/A")}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Storage Footprint</span>
                <span className="font-semibold font-mono">{formatBytes(selectedNode.bytes)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Health & Blast Risk</span>
                <span
                  className={`font-semibold capitalize ${
                    selectedNode.health === "error"
                      ? "text-destructive font-bold"
                      : selectedNode.health === "warning"
                        ? "text-amber-600 font-bold"
                        : selectedNode.health === "info"
                          ? "text-sky-600 font-semibold"
                          : "text-primary"
                  }`}
                >
                  {selectedNode.health} ({selectedNode.dependents.length} downstream)
                </span>
              </div>
            </div>
            {(() => {
              const p = propagationOf(nodes, selectedNode.id)
              if (p.issues === 0) return null
              return (
                <p className="text-xs font-medium text-destructive" data-testid="lineage-propagation">
                  {p.issues} {p.issues === 1 ? "issue propagates" : "issues propagate"} to {p.downstream} downstream{" "}
                  {p.downstream === 1 ? "model" : "models"}
                </p>
              )
            })()}

            {/* Attached Findings & 1-Click Fix Snippets */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-primary" />
                Detected Bugs & 1-Click Fixes ({selectedNode.findings.length})
              </h4>
              {selectedNode.findings.length === 0 ? (
                <div className="text-xs text-primary dark:text-primary bg-primary/10 p-3 rounded-lg flex items-center gap-2 border border-primary/20">
                  <CheckCircle2 className="h-4 w-4" />
                  No issues found on this model. Everything is healthy!
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedNode.findings.map((finding, idx) => {
                    const fixCode = finding.fixSnippet || generateFixSnippet(finding)
                    return (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-lg border text-xs space-y-2.5 ${
                          finding.severity === "error"
                            ? "bg-destructive/10 border-destructive/30 text-destructive dark:text-red-100"
                            : "bg-amber-500/10 border-amber-500/30 text-amber-950 dark:text-amber-100"
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-sm font-bold">{finding.rule}</span>
                          <Badge
                            variant={finding.severity === "error" ? "destructive" : "secondary"}
                            className="text-[10px] px-1.5 py-0 uppercase"
                          >
                            {finding.severity}
                          </Badge>
                        </div>
                        <p className="text-xs">{finding.message}</p>
                        {finding.detail && (
                          <p className="text-[11px] opacity-80">{finding.detail}</p>
                        )}

                        {/* 1-Click Code Fix */}
                        <div className="pt-2 border-t border-current/10 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                            <span className="flex items-center gap-1 text-primary dark:text-primary">
                              <Zap className="h-3.5 w-3.5" /> 1-Click Fix Snippet:
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopyFix(fixCode, idx)}
                              className="h-6 text-[10px] px-2 gap-1 bg-background text-foreground"
                            >
                              {copiedIndex === idx ? (
                                <>
                                  <Check className="h-3 w-3 text-primary" /> Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="h-3 w-3" /> Copy Fix
                                </>
                              )}
                            </Button>
                          </div>
                          <pre className="p-2 bg-slate-950 text-slate-100 rounded font-mono text-[11px] overflow-x-auto">
                            {fixCode}
                          </pre>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Lineage Blast Radius Context */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t text-xs">
              <div>
                <span className="font-semibold text-muted-foreground block mb-1.5">
                  ⬅️ Upstream Dependencies ({selectedNode.dependencies.length})
                </span>
                {selectedNode.dependencies.length === 0 ? (
                  <span className="text-muted-foreground text-[11px]">None (Root node)</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.dependencies.map((dep) => (
                      <Badge
                        key={dep}
                        variant="secondary"
                        className="font-mono text-[10px] cursor-pointer hover:bg-secondary/80"
                        onClick={() => setSelectedNodeId(dep)}
                      >
                        {nameOf(dep)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <span className="font-semibold mb-1.5 flex items-center gap-1 text-amber-700 dark:text-amber-400">
                  <Flame className="h-3.5 w-3.5" /> Downstream Blast Radius ({selectedNode.dependents.length})
                </span>
                {selectedNode.dependents.length === 0 ? (
                  <span className="text-muted-foreground text-[11px]">None (Leaf node)</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNode.dependents.map((dep) => (
                      <Badge
                        key={dep}
                        variant="secondary"
                        className="font-mono text-[10px] cursor-pointer bg-amber-500/15 border-amber-500/30 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25"
                        onClick={() => setSelectedNodeId(dep)}
                      >
                        {nameOf(dep)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
