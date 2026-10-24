"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { trackEvent } from "@/lib/analytics"
import { TRUST_SPRINT_URL } from "@/components/commercial-bridge"
import { ThemeToggle } from "@/components/theme-toggle"
import { LayoutDashboard, BrainCircuit, BookOpen, Settings, Sparkles, ShieldCheck, ClipboardCheck, Network } from "lucide-react"
import { CONFIG_KEY, type AuditConfig } from "@/lib/config"
import { isPublicPath } from "@/lib/public-nav"
import { usePublicMode } from "@/lib/use-public-mode"

type NavItem = { label: string; short?: string; iconOnly?: boolean; href: string; icon: React.ReactNode }

const navSections: { label: string; items: NavItem[] }[] = [
  {
    label: "AUDIT",
    items: [
      { label: "dbt Model Auditor", short: "dbt Models", href: "/", icon: <LayoutDashboard className="h-4 w-4" /> },
      { label: "Cortex AI Infrastructure", short: "Cortex AI", href: "/cortex", icon: <BrainCircuit className="h-4 w-4" /> },
      { label: "Snowsight SQL Battery", short: "SQL Battery", href: "/battery", icon: <Sparkles className="h-4 w-4" /> },
      { label: "dbt Lineage Audit", short: "Lineage", href: "/lineage", icon: <Network className="h-4 w-4" /> },
      { label: "Trust Sprint", short: "Trust Sprint", href: "/trust", icon: <ShieldCheck className="h-4 w-4" /> },
      { label: "Account Audit", short: "Account Audit", href: "/account-audit", icon: <ClipboardCheck className="h-4 w-4" /> },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { label: "Documentation", iconOnly: true, href: "/docs", icon: <BookOpen className="h-4 w-4" /> },
      { label: "Connection Config", iconOnly: true, href: "/setup", icon: <Settings className="h-4 w-4" /> },
    ],
  },
]

export function AppSidebar() {
  const pathname = usePathname()
  const [config, setConfig] = useState<AuditConfig | null>(null)

  // The target shown here is whatever the operator configured in /setup,
  // never a hardcoded account name.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONFIG_KEY)
      setConfig(saved ? (JSON.parse(saved) as AuditConfig) : null)
    } catch {
      setConfig(null)
    }
  }, [pathname])

  return (
    <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-[var(--sidebar-bg)] flex-col justify-between h-screen sticky top-0 text-foreground select-none z-30">
      <div className="flex flex-col">
        <div className="h-12 border-b border-border px-4 flex items-center">
          <Link href="/" className="font-mono font-bold text-xs tracking-wider uppercase">
            Snowflake &amp; dbt Auditor
          </Link>
        </div>

        <div className="p-3 border-b border-border bg-muted/30 font-mono text-[11px] space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>TARGET:</span>
            <span className="text-foreground font-semibold truncate max-w-[9rem]">
              {config ? `${config.database}.${config.schema}` : "not configured"}
            </span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>WAREHOUSE:</span>
            <span className="text-foreground font-semibold truncate max-w-[9rem]">
              {config ? config.warehouse : "-"}
            </span>
          </div>
        </div>

        <div className="p-2 space-y-4 overflow-y-auto max-h-[calc(100vh-190px)]">
          {navSections.map((section) => (
            <div key={section.label} className="space-y-1">
              <div className="px-2 py-1 text-[10px] font-mono font-semibold tracking-wider text-muted-foreground uppercase">
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link key={item.href} href={item.href}>
                      <div
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xs font-mono text-xs transition-colors ${
                          isActive
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        }`}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 border-t border-border bg-muted/30 font-mono text-xs">
        <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Trust Sprint</div>
        <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
          5-day Cortex AI evaluation inside your Snowflake · 4 500 € HT
        </p>
        <a
          href={TRUST_SPRINT_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackEvent("bridge_click", { placement: "sidebar" })}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
        >
          Book 20-min call &rarr;
        </a>
      </div>

      <div className="p-3 border-t border-border bg-muted/20 flex items-center justify-end">
        <ThemeToggle />
      </div>
    </aside>
  )
}


/** Compact navigation for screens under 768px, where the sidebar is hidden. */
export function MobileNav() {
  const pathname = usePathname()
  const locked = usePublicMode()
  // Public demo: only the three demo pages, until /api/mode says otherwise.
  const items = navSections.flatMap((s) => s.items).filter((i) => locked === false || isPublicPath(i.href))
  const strip = useRef<HTMLDivElement>(null)
  // On a phone the pill strip scrolls sideways; bring the current page's pill into view.
  useEffect(() => {
    const s = strip.current
    const a = s?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!s || !a) return
    const sr = s.getBoundingClientRect()
    const r = a.getBoundingClientRect()
    s.scrollLeft += r.left - sr.left - (sr.width - r.width) / 2
  }, [pathname])
  return (
    <nav aria-label="Pages" className="z-40 border-b md:sticky md:top-0 border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 md:flex-nowrap md:px-6">
        <Link href="/" className="flex items-center gap-2 py-1 font-serif text-lg font-medium text-foreground">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
          Snowflake &amp; dbt Auditor
        </Link>
        <div className="ml-auto md:order-last">
          <ThemeToggle />
        </div>
        <div ref={strip} className="-mx-1 flex w-full gap-1 overflow-x-auto px-1 pb-1 md:w-auto md:flex-1 md:pb-0">
          {items.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                title={item.label}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className={item.iconOnly ? "inline-flex" : "hidden xl:inline-flex"} aria-hidden="true">
                  {item.icon}
                </span>
                {item.iconOnly ? (
                  <span className="md:sr-only">{item.label}</span>
                ) : (
                  <>
                    <span className="xl:hidden">{item.short ?? item.label}</span>
                    <span className="hidden xl:inline">{item.label}</span>
                  </>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
