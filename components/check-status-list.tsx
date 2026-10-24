"use client"

import type { CheckStatus } from "@/lib/audit-engine"

/** Shows which checks ran and which could not, with the reason. A failed check is never a finding. */
export function CheckStatusList({ checks }: { checks: CheckStatus[] }) {
  const failed = checks.filter((c) => c.status === "failed")
  return (
    <div className="bg-card border border-border rounded-xs text-xs">
      <div className="px-4 py-2 border-b border-border font-bold">
        Checks: {checks.length - failed.length} ran, {failed.length} could not run
      </div>
      <ul>
        {checks.map((c) => (
          <li key={c.rule} className="px-4 py-2 border-t border-border first:border-t-0">
            <span className={c.status === "ok" ? "text-primary dark:text-primary" : "text-destructive dark:text-destructive"}>
              {c.status === "ok" ? "RAN" : "FAILED"}
            </span>{" "}
            <span className="font-mono">{c.name}</span>
            {c.error && <div className="text-muted-foreground mt-1 break-words">{c.error}</div>}
          </li>
        ))}
      </ul>
    </div>
  )
}
