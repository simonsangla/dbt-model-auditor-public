"use client"

import { Analytics } from "@vercel/analytics/next"
import { useEffect } from "react"
import { filterEvent, syncOptOutFromSearch } from "@/lib/analytics-core"

/**
 * CANONICAL SOURCE: claude-config/skills/vercel-launch/assets/analytics/site-analytics.tsx
 * Vendored byte-identical; render it only when shouldRenderAnalytics() is true.
 * Client wrapper: `beforeSend` is a function prop and the root layout is a Server Component.
 */
export function SiteAnalytics() {
  useEffect(() => {
    syncOptOutFromSearch(window.location.search)
  }, [])
  return <Analytics beforeSend={filterEvent} />
}
