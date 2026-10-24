// Pure DAG builder behind the lineage map. Kept out of the component so the node
// identity and health rules are unit-testable.
import type { AuditFinding, ModelInfo } from "./audit-engine"
import type { DbtManifest } from "./manifest-parser"

export type PipelineLayer = "sources" | "staging" | "intermediate" | "marts" | "exposures"
export type NodeHealth = "healthy" | "info" | "warning" | "error"

export interface LineageNode {
  /** Internal key: lower-case model name, "source:<name>" for a dbt source, "exposure:<name>" for an exposure. */
  id: string
  name: string
  layer: PipelineLayer
  type: "source" | "model" | "exposure"
  kind?: string
  rows?: number
  bytes?: number
  description?: string
  dependencies: string[] // Upstream node ids
  dependents: string[] // Downstream node ids
  findings: AuditFinding[]
  health: NodeHealth
}

export interface LineageStats {
  total: number
  errorCount: number
  warningCount: number
  infoCount: number
  healthyCount: number
}

export function detectLayer(name: string, isSource = false): PipelineLayer {
  if (isSource || name.startsWith("raw_") || name.startsWith("source_") || name.startsWith("src_")) {
    return "sources"
  }
  const lower = name.toLowerCase()
  if (lower.startsWith("stg_") || lower.startsWith("base_")) return "staging"
  if (lower.startsWith("int_") || lower.startsWith("prep_")) return "intermediate"
  return "marts"
}

/** Sources live in their own namespace so a source and a seed/model of the same name never merge. */
export function sourceKey(name: string): string {
  return `source:${name.toLowerCase()}`
}

/** Exposures get their own namespace too: an exposure may share a model's name. */
export function exposureKey(name: string): string {
  return `exposure:${name.toLowerCase()}`
}

export function healthOf(findings: AuditFinding[]): NodeHealth {
  if (findings.some((f) => f.severity === "error")) return "error"
  if (findings.some((f) => f.severity === "warning")) return "warning"
  if (findings.some((f) => f.severity === "info")) return "info"
  return "healthy"
}

function emptyNode(id: string, name: string, layer: PipelineLayer, type: LineageNode["type"]): LineageNode {
  return { id, name, layer, type, dependencies: [], dependents: [], findings: [], health: "healthy" }
}

export function buildLineageNodes(
  models: ModelInfo[] = [],
  findings: AuditFinding[] = [],
  manifest?: DbtManifest | null,
): { nodes: LineageNode[]; stats: LineageStats } {
  const nodeMap = new Map<string, LineageNode>()

  // 1. Sources from the manifest, keyed in the source namespace.
  if (manifest?.sources) {
    for (const src of Object.values(manifest.sources)) {
      const id = sourceKey(src.name)
      nodeMap.set(id, emptyNode(id, src.name, "sources", "source"))
    }
  }

  // 2. Warehouse models. Snowflake reports unquoted identifiers in UPPER case while the
  // dbt manifest uses lower case, so model nodes are keyed case-insensitively.
  for (const m of models) {
    const id = m.name.toLowerCase()
    const node = emptyNode(id, m.name, detectLayer(id), "model")
    node.kind = m.kind
    node.rows = m.rows ?? undefined
    node.bytes = m.rows === null ? undefined : m.bytes
    nodeMap.set(id, node)
  }

  // 3. Manifest models and their dependencies. Source ids look like
  // source.<pkg>.<source>.<table> and map to the source namespace.
  if (manifest?.nodes) {
    for (const n of Object.values(manifest.nodes)) {
      if (n.resource_type !== "model") continue
      const id = n.name.toLowerCase()
      let node = nodeMap.get(id)
      if (!node) {
        node = emptyNode(id, n.name, detectLayer(id), "model")
        nodeMap.set(id, node)
      }
      node.description = n.description
      for (const dep of n.depends_on?.nodes ?? []) {
        const depName = dep.split(".").pop()?.toLowerCase()
        if (!depName) continue
        const isSource = dep.startsWith("source.")
        const depId = isSource ? sourceKey(depName) : depName
        if (depId === id || node.dependencies.includes(depId)) continue
        node.dependencies.push(depId)
        if (isSource && !nodeMap.has(depId)) {
          nodeMap.set(depId, emptyNode(depId, depName, "sources", "source"))
        }
      }
    }
  }
  // 4. Exposures: downstream consumers, linked only to models already in the graph.
  for (const exp of Object.values(manifest?.exposures ?? {})) {
    const id = exposureKey(exp.name)
    const node = emptyNode(id, exp.label || exp.name, "exposures", "exposure")
    node.kind = exp.type ? exp.type.toUpperCase() : "EXPOSURE"
    node.description = exp.description
    for (const dep of exp.depends_on?.nodes ?? []) {
      const depName = dep.split(".").pop()?.toLowerCase()
      if (!depName) continue
      const depId = dep.startsWith("source.") ? sourceKey(depName) : depName
      if (nodeMap.has(depId) && !node.dependencies.includes(depId)) node.dependencies.push(depId)
    }
    nodeMap.set(id, node)
  }
  // Without a manifest there are no edges: dependencies are never guessed from names.

  for (const node of nodeMap.values()) {
    for (const depId of node.dependencies) {
      const parent = nodeMap.get(depId)
      if (parent && !parent.dependents.includes(node.id)) parent.dependents.push(node.id)
    }
  }

  // 5. Findings attach to the model of that name, else to the source of that name.
  for (const finding of findings) {
    if (!finding.model) continue
    const key = finding.model.toLowerCase()
    const node = nodeMap.get(key) ?? nodeMap.get(sourceKey(key))
    if (node) node.findings.push(finding)
  }
  for (const node of nodeMap.values()) node.health = healthOf(node.findings)

  const nodes = Array.from(nodeMap.values())
  const count = (h: NodeHealth) => nodes.filter((n) => n.health === h).length
  return {
    nodes,
    stats: {
      total: nodes.length,
      errorCount: count("error"),
      warningCount: count("warning"),
      infoCount: count("info"),
      healthyCount: count("healthy"),
    },
  }
}

/** Model names reachable downstream of a node (transitive, each counted once). */
export function downstreamModels(nodes: LineageNode[], id: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const stack = [...(byId.get(id)?.dependents ?? [])]
  while (stack.length) {
    const next = stack.pop()!
    if (seen.has(next)) continue
    seen.add(next)
    stack.push(...(byId.get(next)?.dependents ?? []))
  }
  return [...seen].filter((k) => byId.get(k)?.type === "model").map((k) => byId.get(k)!.name)
}

/** Error/warning findings on a node and how many downstream models inherit them. */
export function propagationOf(nodes: LineageNode[], id: string): { issues: number; downstream: number } {
  const node = nodes.find((n) => n.id === id)
  const issues = node?.findings.filter((f) => f.severity === "error" || f.severity === "warning").length ?? 0
  return { issues, downstream: downstreamModels(nodes, id).length }
}

/** Edges leaving a node with error or warning findings are drawn as risky. */
export function isRiskyEdgeSource(node?: LineageNode): boolean {
  return !!node && (node.health === "error" || node.health === "warning")
}

/** Number of distinct dependency edges between nodes present in the graph. */
export function countEdges(nodes: LineageNode[]): number {
  const ids = new Set(nodes.map((n) => n.id))
  return nodes.reduce((acc, n) => acc + n.dependencies.filter((d) => ids.has(d)).length, 0)
}

export interface EdgeAnchor {
  x1: number
  x2: number
  y: number
}

// SVG path for one dependency edge between two measured cards. Upstream left of
// downstream: a curve from the source's right side to the target's left side.
// Same column (e.g. a mart built on another mart): a loop out of the right side
// and back, so the dependency is still visible. Backward across columns: null.
export function edgePath(from: EdgeAnchor, to: EdgeAnchor): string | null {
  if (from.x2 <= to.x1) {
    const dx = Math.max(24, (to.x1 - from.x2) / 2)
    return `M ${from.x2} ${from.y} C ${from.x2 + dx} ${from.y}, ${to.x1 - dx} ${to.y}, ${to.x1} ${to.y}`
  }
  if (Math.abs(from.x1 - to.x1) < 1 && Math.abs(from.x2 - to.x2) < 1) {
    // Stays inside the column's inner padding (cards sit ~16px from its border).
    const bulge = 14
    return `M ${from.x2} ${from.y} C ${from.x2 + bulge} ${from.y}, ${to.x2 + bulge} ${to.y}, ${to.x2} ${to.y}`
  }
  return null
}

export interface GraphSelector {
  name: string
  /** Ancestor generations to include (Infinity = all). */
  up: number
  /** Descendant generations to include (Infinity = all). */
  down: number
}

// dbt node-selection graph operators: "+m" ancestors, "m+" descendants, "+m+" both,
// with an optional depth ("2+m", "m+1"). Plain text (no "+") is not a selector.
export function parseSelector(query: string): GraphSelector | null {
  const m = query.trim().match(/^(\d*)(\+?)([A-Za-z0-9_:.\-]+?)(\+?)(\d*)$/)
  if (!m || (!m[2] && !m[4])) return null
  const [, upDepth, upOp, name, downOp, downDepth] = m
  const depth = (op: string, n: string) => (!op ? 0 : n ? Number(n) : Infinity)
  return { name: name.toLowerCase(), up: depth(upOp, upDepth), down: depth(downOp, downDepth) }
}

/** Ids selected by a graph-operator query, plus the root node it focuses; null for plain text. */
export function selectNodes(nodes: LineageNode[], query: string): { ids: Set<string>; root: string | null } | null {
  const selector = parseSelector(query)
  if (!selector) return null
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const root = nodes.find((n) => n.id === selector.name || n.name.toLowerCase() === selector.name)
  const ids = new Set<string>()
  if (!root) return { ids, root: null }
  ids.add(root.id)
  const walk = (start: string, depth: number, next: (n: LineageNode) => string[]) => {
    let frontier = [start]
    for (let level = 0; level < depth && frontier.length; level++) {
      const following: string[] = []
      for (const id of frontier) {
        for (const k of next(byId.get(id) as LineageNode)) {
          if (!byId.has(k) || ids.has(k)) continue
          ids.add(k)
          following.push(k)
        }
      }
      frontier = following
    }
  }
  walk(root.id, selector.up, (n) => n.dependencies)
  walk(root.id, selector.down, (n) => n.dependents)
  return { ids, root: root.id }
}
