import { track } from "@vercel/analytics"
import type { BeforeSendEvent } from "@vercel/analytics"

/**
 * CANONICAL SOURCE: claude-config/skills/vercel-launch/assets/analytics/analytics-core.ts
 * Vendored byte-identical into each site as lib/analytics-core.ts; never edit a copy
 * (scripts/analytics-parity.sh fails on divergence). Site-specific event names and
 * allowed values live in the site's own lib/analytics.ts, never here.
 *
 * Vercel Web Analytics: cookieless, production only, browser-local opt-out.
 */
type Env = Record<string, string | undefined>

export const OPT_OUT_KEY = "ss:analytics-opt-out"
export const OPT_OUT_PARAM = "analytics"

export function shouldRenderAnalytics(env: Env = process.env): boolean {
  return env.VERCEL_ENV === "production"
}

/** true = opt out, false = opt back in, null = no opinion. */
export function readOptOutFromSearch(search: string): boolean | null {
  const value = new URLSearchParams(search).get(OPT_OUT_PARAM)?.trim().toLowerCase()
  if (value === "off") return true
  if (value === "on") return false
  return null
}

/** Storage can throw (private mode): fail open, an unreadable store means not opted out. */
export function isOptedOut(): boolean {
  try {
    return window.localStorage.getItem(OPT_OUT_KEY) === "1"
  } catch {
    return false
  }
}

export function setOptOut(optOut: boolean): void {
  try {
    if (optOut) window.localStorage.setItem(OPT_OUT_KEY, "1")
    else window.localStorage.removeItem(OPT_OUT_KEY)
  } catch {
    // keep the previous state
  }
}

/** Apply ?analytics=off|on to storage and return the resulting state. */
export function syncOptOutFromSearch(search: string): boolean {
  const asked = readOptOutFromSearch(search)
  if (asked !== null) setOptOut(asked)
  return isOptedOut()
}

/** beforeSend: drops pageviews and custom events from an opted-out browser. */
export function filterEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  return isOptedOut() ? null : event
}

/** event name -> property name -> the closed set of values that may be sent. */
export type EventSchema = Record<string, Record<string, readonly string[]>>

/**
 * The only way to send a custom event. Names come from the schema, property values must be
 * in their closed set (anything else is dropped, the event still counts), and an opted-out
 * browser sends nothing. Never send audit content, names, files, emails or free text.
 */
export function createTracker<S extends EventSchema>(schema: S) {
  return function trackEvent<E extends keyof S & string>(name: E, props?: { [K in keyof S[E]]?: string }): void {
    if (isOptedOut() || !Object.prototype.hasOwnProperty.call(schema, name)) return
    const allowed = schema[name]
    const safe: Record<string, string> = {}
    for (const [key, value] of Object.entries(props ?? {})) {
      if (typeof value === "string" && allowed[key]?.includes(value)) safe[key] = value
    }
    track(name, Object.keys(safe).length ? safe : undefined)
  }
}

/**
 * Scroll depth: calls `send(sectionId)` once per section the first time it becomes active.
 * The first section is the landing state (already a pageview); a jump reports the section
 * reached, not the ones skipped.
 */
export function createDepthTracker(sectionIds: readonly string[], send: (sectionId: string) => void): (index: number) => void {
  const seen = new Set<number>()
  return (index) => {
    if (index < 1 || index >= sectionIds.length || seen.has(index)) return
    seen.add(index)
    send(sectionIds[index])
  }
}
