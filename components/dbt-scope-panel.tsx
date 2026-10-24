"use client"

import type { DbtScope } from "@/lib/dbt-identity"

function List({ title, names, empty }: { title: string; names: string[]; empty: string }) {
  return (
    <div className="space-y-1">
      <div className="font-semibold">
        {title} ({names.length})
      </div>
      {names.length === 0 ? (
        <div className="text-muted-foreground">{empty}</div>
      ) : (
        <div className="font-mono text-muted-foreground break-words">{names.join(", ")}</div>
      )}
    </div>
  )
}

/** Says which objects the score covers: every table and view, or dbt models only. */
export function DbtScopePanel({ scope, target, totalObjects }: { scope: DbtScope | null; target: string; totalObjects: number }) {
  if (!scope) {
    return (
      <div className="p-3 rounded-lg border text-xs text-muted-foreground">
        Scope: all {totalObjects} tables and views in <span className="font-mono">{target}</span>. Snowflake metadata
        carries no dbt identity; upload the project&apos;s manifest.json to audit dbt models only.
      </div>
    )
  }
  if (scope.targetedCount === 0) {
    return (
      <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200">
        The loaded manifest builds no model into <span className="font-mono">{target}</span> (wrong manifest, or a
        different target). The audit still covers all {totalObjects} tables and views.
      </div>
    )
  }
  return (
    <div className="p-4 rounded-lg border text-xs space-y-3">
      <div>
        Scope: <span className="font-semibold">dbt models only</span> in <span className="font-mono">{target}</span>, matched
        through the manifest (database, schema, alias). The score below covers these {scope.dbtModels.length}.
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <List title="dbt models" names={scope.dbtModels.map((m) => m.name)} empty="None matched." />
        <List
          title="Not built by the manifest"
          names={scope.notInManifest.map((m) => m.name)}
          empty="Every object is a dbt model."
        />
        <List
          title="In the manifest, missing in Snowflake"
          names={scope.missingInSnowflake.map((n) => n.alias || n.name)}
          empty="Every targeted model exists."
        />
      </div>
    </div>
  )
}
