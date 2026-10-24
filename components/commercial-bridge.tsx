"use client"

import { ArrowRight } from "lucide-react"
import { trackEvent } from "@/lib/analytics"
import { CookieSettingsButton } from "@/components/consent-banner"

export const TRUST_SPRINT_URL = "https://example.com"
export function CommercialTopBanner() {
  return (
    <aside aria-label="Commercial announcement" className="w-full bg-primary/10 border-b border-primary/20 text-foreground px-4 py-2 text-xs font-mono">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-primary/20 text-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Open-source demo
          </span>
          <span className="text-muted-foreground hidden sm:inline">
            Read-only audit of a Snowflake schema and a dbt manifest
          </span>
        </div>
        <a
          href={TRUST_SPRINT_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent("bridge_click", { placement: "banner" })}
          className="inline-flex items-center gap-1 font-bold text-primary hover:underline ml-auto sm:ml-0"
        >
          <span>Project page</span>
          <ArrowRight className="h-3 w-3" />
        </a>
      </div>
    </aside>
  )
}

export function CommercialFooter() {
  return (
    <footer className="border-t border-border bg-muted/20 py-6 px-4 md:px-6 text-xs text-muted-foreground mt-auto font-mono">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-foreground">
            Snowflake and dbt model auditor
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Runs inside your Snowflake account, read-only role · Fixed scope · Deterministic revenue driver analysis
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            <CookieSettingsButton />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
        <a
          href={TRUST_SPRINT_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent("bridge_click", { placement: "footer" })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-primary text-primary-foreground font-semibold text-xs hover:opacity-90 transition-opacity"
        >
          <span>Project page</span>
          <ArrowRight className="h-3 w-3" />
        </a>
        </div>
      </div>
    </footer>
  )
}
