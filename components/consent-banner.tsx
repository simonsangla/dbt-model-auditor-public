"use client"

import { useEffect, useRef, useState } from "react"
import { syncOptOutFromSearch } from "@/lib/analytics-core"
import { CONSENT_RESET_EVENT, ga } from "@/lib/ga"
import type { Consent } from "@/lib/ga-consent-core"

/**
 * GA4 consent banner, same behaviour as the marketing site (#981).
 * `enabled` is true on production only; `?ga_debug=1` turns it on elsewhere for
 * testing. `?analytics=off` hides it and never loads GA. `?consent=reset`
 * forgets the choice. Nothing is requested or stored before a click.
 */
export function ConsentBanner({ enabled, privacyUrl }: { enabled: boolean; privacyUrl: string }) {
  const [open, setOpen] = useState(false)
  const debug = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (syncOptOutFromSearch(window.location.search)) return
    debug.current = !enabled && params.get("ga_debug") === "1"
    if (!enabled && !debug.current) return
    if (params.get("consent") === "reset") ga.write(null)
    const consent = ga.read()
    if (consent === "granted") ga.load(debug.current)
    else if (consent === null) setOpen(true)
    const reopen = () => setOpen(true)
    window.addEventListener(CONSENT_RESET_EVENT, reopen)
    return () => window.removeEventListener(CONSENT_RESET_EVENT, reopen)
  }, [enabled])

  function choose(consent: Consent) {
    ga.write(consent)
    setOpen(false)
    if (consent === "granted") ga.load(debug.current)
  }

  if (!open) return null
  return (
    <section
      aria-label="Analytics consent"
      data-testid="consent-banner"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-md border border-border bg-card p-4 text-card-foreground shadow-lg text-sm"
    >
      <p className="mb-3 text-muted-foreground leading-relaxed">
        May this site use Google Analytics to count visits and clicks? Only page paths are sent, never your
        audit data.{" "}
        <a href={privacyUrl} className="font-medium text-primary underline-offset-4 hover:underline">
          Privacy
        </a>
      </p>
      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => choose("denied")} className="rounded-sm border border-border px-3 py-1.5">
          Decline
        </button>
        <button type="button" onClick={() => choose("granted")} className="rounded-sm bg-primary px-3 py-1.5 text-primary-foreground">
          Accept
        </button>
      </div>
    </section>
  )
}

/** Withdraw consent and reopen the banner. */
export function CookieSettingsButton() {
  return (
    <button type="button" onClick={() => ga.reset()} className="underline-offset-4 hover:underline">
      Cookie settings
    </button>
  )
}
