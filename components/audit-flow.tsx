"use client"

import { createDepthTracker, trackEvent } from "@/lib/analytics"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { StepIndicator, type Step } from "@/components/step-indicator"

/** The five sections every audit page walks through, in order (SPEC V11). */
export const AUDIT_SECTIONS: Step[] = [
  { id: "inputs", label: "Inputs" },
  { id: "evaluation", label: "Evaluation" },
  { id: "risk", label: "Risk matrix" },
  { id: "recommendations", label: "Recommendations" },
  { id: "evidence", label: "Evidence" },
]

type SectionContent = Record<"inputs" | "evaluation" | "risk" | "recommendations" | "evidence", ReactNode>

/**
 * Shared layout for audit pages: one vertical scroll through five numbered
 * sections, with a sticky step rail on desktop and a compact stepper under 768px.
 * Tabs, when a page needs them, live inside a section, never around the flow.
 */
/** Count a click on a step-rail link; the anchor is one of the five fixed section ids. */
function trackStepClick(e: React.MouseEvent) {
  const a = (e.target as HTMLElement).closest?.("a[href^='#']")
  if (a) trackEvent("step_nav", { step: a.getAttribute("href")!.slice(1) })
}

export function AuditFlow({
  title,
  description,
  eyebrow = "AI Analytics Trust Sprint",
  ...content
}: { title: string; description: ReactNode; eyebrow?: string } & SectionContent) {
  const [current, setCurrent] = useState(0)
  const reachSection = useMemo(() => createDepthTracker(AUDIT_SECTIONS.map((s) => s.id)), [])

  useEffect(() => reachSection(current), [current, reachSection])

  useEffect(() => {
    // Active step = the last section whose top has scrolled past the reading line.
    // Recomputed from every section on each scroll, so the last section is reachable
    // even when the page ends before it hits the top.
    const update = () => {
      // Below the section scroll margin (144px under xl), so a step link lands on its own step.
      const line = 160
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
      if (atBottom) return setCurrent(AUDIT_SECTIONS.length - 1)
      let idx = 0
      AUDIT_SECTIONS.forEach((s, i) => {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= line) idx = i
      })
      setCurrent(idx)
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [])

  return (
    <div className="p-6">
      <header className="-mx-6 -mt-6 mb-6 bg-primary px-6 py-6 text-primary-foreground md:py-8 dark:border-b dark:border-primary/30 dark:bg-primary/15 dark:text-foreground">
        <div className="max-w-3xl space-y-2">
          <p className="text-sm font-medium opacity-90">{eyebrow}</p>
          <h1 className="font-serif text-3xl font-medium leading-tight md:text-4xl">{title}</h1>
          <div className="text-base opacity-90">{description}</div>
        </div>
      </header>

      <nav
        onClick={trackStepClick}
        aria-label="Audit steps, compact"
        className="sticky top-0 z-10 -mx-6 mb-6 border-b bg-background/95 px-6 pt-3 backdrop-blur md:top-[53px] xl:hidden"
      >
        <StepIndicator current={current} steps={AUDIT_SECTIONS} />
      </nav>

      <div className="xl:grid xl:grid-cols-[200px_minmax(0,1fr)] xl:gap-10">
        <nav aria-label="Audit steps" onClick={trackStepClick} className="hidden xl:block">
          <div className="sticky top-20">
            <StepIndicator current={current} steps={AUDIT_SECTIONS} orientation="vertical" />
          </div>
        </nav>

        <div className="min-w-0 space-y-12 pb-[75vh]">
          {AUDIT_SECTIONS.map((s, i) => (
            <section id={s.id} key={s.id} className="scroll-mt-36 space-y-4 xl:scroll-mt-24">
              <h2 className="flex items-baseline gap-3 font-serif text-xl font-medium">
                <span className="font-mono text-sm text-muted-foreground">{`0${i + 1}`}</span>
                {s.label}
              </h2>
              {content[s.id as keyof SectionContent]}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
