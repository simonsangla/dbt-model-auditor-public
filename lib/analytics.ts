import { createDepthTracker as createCoreDepthTracker, createTracker, isOptedOut } from "@/lib/analytics-core"
import { forwardToGa } from "@/lib/ga"

/**
 * Site-specific half of the analytics module (SPEC V17). The generic core is vendored from
 * claude-config/skills/vercel-launch/assets/analytics and must not be edited here.
 * Events are fixed names; `step` is one of the five audit section ids, never audit content.
 */
export {
  OPT_OUT_KEY,
  OPT_OUT_PARAM,
  filterEvent,
  isOptedOut,
  readOptOutFromSearch,
  setOptOut,
  shouldRenderAnalytics,
  syncOptOutFromSearch,
} from "@/lib/analytics-core"

const STEPS = ["inputs", "evaluation", "risk", "recommendations", "evidence"] as const
const PLACEMENTS = ["banner", "sidebar", "footer"] as const

const SCHEMA = {
  export_report: {},
  step_nav: { step: STEPS },
  scroll_depth: { step: STEPS },
  bridge_click: { placement: PLACEMENTS },
} as const

type Schema = typeof SCHEMA
const trackVercel = createTracker(SCHEMA)

/**
 * Vercel (cookieless, always) + GA4 (consent-gated, #981). GA4 receives the same
 * closed-set values under the shared event names (see lib/ga.ts); an opted-out browser
 * sends to neither, and without consent the GA core sends nothing.
 */
export function trackEvent<E extends keyof Schema & string>(name: E, props?: { [K in keyof Schema[E]]?: string }): void {
  trackVercel(name, props)
  if (isOptedOut()) return
  const allowed = SCHEMA[name] as Record<string, readonly string[]>
  const safe: Record<string, string> = {}
  for (const [key, value] of Object.entries(props ?? {})) {
    if (typeof value === "string" && allowed[key]?.includes(value)) safe[key] = value
  }
  forwardToGa(name, safe)
}

/** One `scroll_depth` event per audit section the first time it becomes active (first section excluded). */
export function createDepthTracker(sectionIds: readonly string[]): (index: number) => void {
  return createCoreDepthTracker(sectionIds, (step) => trackEvent("scroll_depth", { step }))
}
