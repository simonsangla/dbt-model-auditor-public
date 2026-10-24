"use client"

import type { CortexInfraAuditResult } from "@/lib/cortex-infra-auditor"
import { CheckStatusList } from "@/components/check-status-list"

function ObjectTable({
  title,
  empty,
  rows,
}: {
  title: string
  empty: string
  rows: CortexInfraAuditResult["searchServices"]
}) {
  return (
    <div className="bg-card border border-border rounded-xs">
      <div className="px-4 py-2 border-b border-border text-xs font-bold">
        {title} ({rows.length})
      </div>
      {rows.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Created</th>
              <th className="text-left px-4 py-2">Comment</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.database}.${r.schema}.${r.name}`} className="border-t border-border">
                <td className="px-4 py-2 font-mono">{r.name}</td>
                <td className="px-4 py-2">{r.createdOn?.slice(0, 10) ?? "-"}</td>
                <td className="px-4 py-2">{r.comment ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function CortexInfraPanel({ data }: { data: CortexInfraAuditResult }) {
  return (
    <div className="space-y-4">
      <CheckStatusList checks={data.checks} />
      <ObjectTable
        title="Cortex Search services"
        empty="None visible to this role in the configured schema."
        rows={data.searchServices}
      />
      <ObjectTable
        title="Semantic views"
        empty="None visible to this role in the configured schema."
        rows={data.semanticViews}
      />
    </div>
  )
}
