import { createGaConsent } from "@/lib/ga-consent-core"

/**
 * dbt-model-auditor facade over the shared consent-first GA4 core (#981).
 * Ruling 2026-10-02: one GA4 property for the marketing site and the auditor
 * (measurement ID ends VG8), reports split by hostname. Vercel event names stay
 * unchanged (the apps/me dashboard reads them); only the GA4 side uses the shared
 * names below.
 */
export const GA_ID = "G-3DZ9GWDVG8"
export const CONSENT_KEY = "ss:ga-consent"
export const CONSENT_RESET_EVENT = "ss:consent-reset"

export const ga = createGaConsent({
  measurementId: GA_ID,
  storageKey: CONSENT_KEY,
  resetEvent: CONSENT_RESET_EVENT,
})

type Props = Record<string, string> | undefined

/** Vercel event name -> the shared GA4 event it is forwarded as. */
const GA_EVENT: Record<string, (props: Props) => [string, Record<string, string>]> = {
  bridge_click: (p) => ["cta_click", { placement: `auditor_${p?.placement ?? "unknown"}` }],
  step_nav: (p): [string, Record<string, string>] => ["demo_step", p?.step ? { step: p.step } : {}],
  scroll_depth: (p): [string, Record<string, string>] => ["section_view", p?.step ? { section: p.step } : {}],
  export_report: () => ["demo_export", {}],
}

/** Forward an already-validated Vercel event to GA4; the core enforces consent. */
export function forwardToGa(name: string, props: Props): void {
  const map = GA_EVENT[name]
  if (!map) return
  const [gaName, gaProps] = map(props)
  ga.track(gaName, gaProps)
}
