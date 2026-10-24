import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { AuditFlow, AUDIT_SECTIONS } from "../../components/audit-flow"
import { StepIndicator } from "../../components/step-indicator"

const html = renderToStaticMarkup(
  <AuditFlow
    title="Trust Sprint"
    description="d"
    inputs={<p>in</p>}
    evaluation={<p>ev</p>}
    risk={<p>ri</p>}
    recommendations={<p>re</p>}
    evidence={<p>ed</p>}
  />,
)

describe("AuditFlow (V11)", () => {
  it("declares the 5 sections in order", () => {
    expect(AUDIT_SECTIONS.map((s) => s.id)).toEqual(["inputs", "evaluation", "risk", "recommendations", "evidence"])
    expect(AUDIT_SECTIONS.map((s) => s.label)).toEqual(["Inputs", "Evaluation", "Risk matrix", "Recommendations", "Evidence"])
  })

  it("renders each section once, in order, with its stable id and number", () => {
    const positions = AUDIT_SECTIONS.map((s) => html.indexOf(`<section id="${s.id}"`))
    positions.forEach((p) => expect(p).toBeGreaterThanOrEqual(0))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    AUDIT_SECTIONS.forEach((s, i) => expect(html).toContain(`0${i + 1}`))
  })

  it("step rail and mobile stepper both link to every section", () => {
    AUDIT_SECTIONS.forEach((s) => {
      expect(html.split(`href="#${s.id}"`).length - 1).toBeGreaterThanOrEqual(2)
    })
  })

  it("rail from 1280px (xl), compact stepper below it", () => {
    expect(html).toMatch(/<nav[^>]*aria-label="Audit steps"[^>]*class="[^"]*hidden xl:block/)
    expect(html).toMatch(/<nav[^>]*aria-label="Audit steps, compact"[^>]*class="[^"]*xl:hidden/)
  })

  it("keeps the dbt auditor home page on the shared flow", () => {
    const source = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8")
    expect(source).toContain('from "@/components/audit-flow"')
    expect(source).toContain("<AuditFlow")
    expect(source).toContain("inputs={")
    expect(source).toContain("evaluation={")
    expect(source).toContain("risk={")
    expect(source).toContain("recommendations={")
    expect(source).toContain("evidence={")
  })

  it("keeps every audit surface on the shared flow", () => {
    for (const page of ["app/page.tsx", "app/cortex/page.tsx", "app/battery/page.tsx", "app/trust/page.tsx", "app/account-audit/page.tsx"]) {
      const source = readFileSync(join(process.cwd(), page), "utf8")
      expect(source).toContain("<AuditFlow")
      expect(source).toMatch(/inputs[= ]/)
      expect(source).toMatch(/evaluation[= ]/)
      expect(source).toMatch(/risk[= ]/)
      expect(source).toMatch(/recommendations[= ]/)
      expect(source).toMatch(/evidence[= ]/)
    }
  })
})

describe("StepIndicator reuse", () => {
  it("keeps the setup usage (numbered circles, no links)", () => {
    const out = renderToStaticMarkup(<StepIndicator current={1} total={4} />)
    expect(out.match(/rounded-full/g)?.length).toBe(4)
    expect(out).not.toContain("href=")
  })
})

describe("free-audit CTA removed", () => {
  it("renders no free audit offer after the evidence section", () => {
    expect(html).not.toContain('aria-label="Free schema audit"')
    expect(html).not.toMatch(/free read-only/i)
  })
})
