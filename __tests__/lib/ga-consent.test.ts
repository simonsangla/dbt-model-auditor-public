import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }))

// Minimal browser double: records every script injected, every storage write
// and every cookie write, so "nothing before consent" is a checkable fact.
function fakeBrowser(href = "https://dbt-model-auditor.vercel.app/?utm_source=linkedin&prospect=abc#risk") {
  const store = new Map<string, string>()
  const scripts: string[] = []
  const cookieWrites: string[] = []
  let cookieJar = "_ga=GA1.1.1; _ga_3DZ9GWDVG8=GS1; other=1"
  const win = {
    location: new URL(href),
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    dispatchEvent: vi.fn(),
  } as unknown as Window & typeof globalThis
  const doc = {
    referrer: "https://www.linkedin.com/feed/?trk=abc",
    head: { appendChild: (el: { src: string }) => void scripts.push(el.src) },
    createElement: () => ({ async: false, src: "" }),
    get cookie() {
      return cookieJar
    },
    set cookie(v: string) {
      cookieWrites.push(v)
      if (v.includes("Max-Age=0")) cookieJar = cookieJar.split("; ").filter((c) => !c.startsWith(v.split("=")[0] + "=")).join("; ")
    },
  }
  vi.stubGlobal("window", win)
  vi.stubGlobal("document", doc)
  return { store, scripts, cookieWrites, win }
}

async function freshModules() {
  vi.resetModules()
  const core = await import("../../lib/ga-consent-core")
  const ga = await import("../../lib/ga")
  const analytics = await import("../../lib/analytics")
  return { core, ga, analytics }
}

function gtagCalls(win: Window): unknown[][] {
  return (win.dataLayer ?? []).map((a) => Array.from(a as ArrayLike<unknown>))
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe("GA4 consent core (#981)", () => {
  it("requests and stores nothing before a choice, even when load and events are called", async () => {
    const b = fakeBrowser()
    const { ga, analytics } = await freshModules()
    ga.ga.load(false)
    analytics.trackEvent("bridge_click", { placement: "banner" })
    expect(b.scripts).toEqual([])
    expect(b.store.size).toBe(0)
    expect(b.cookieWrites).toEqual([])
    expect(b.win.dataLayer).toBeUndefined()
    expect(b.win.gtag).toBeUndefined()
  })

  it("after Accept: loads gtag once with the shared ID and path-only page fields", async () => {
    const b = fakeBrowser()
    const { ga } = await freshModules()
    ga.ga.write("granted")
    ga.ga.load(false)
    ga.ga.load(false)
    expect(b.scripts).toEqual(["https://www.googletagmanager.com/gtag/js?id=G-3DZ9GWDVG8"])
    const config = gtagCalls(b.win).find((a) => a[0] === "config")
    expect(config?.[2]).toEqual({
      page_location: "https://dbt-model-auditor.vercel.app/",
      page_referrer: "https://www.linkedin.com/feed/",
    })
  })

  it("forwards auditor events under the shared names, only after consent", async () => {
    const b = fakeBrowser()
    const { ga, analytics } = await freshModules()
    ga.ga.write("granted")
    ga.ga.load(false)
    analytics.trackEvent("bridge_click", { placement: "footer" })
    analytics.trackEvent("step_nav", { step: "risk" })
    analytics.trackEvent("scroll_depth", { step: "evidence" })
    analytics.trackEvent("export_report")
    analytics.trackEvent("step_nav", { step: "my-secret-model-name" })
    const events = gtagCalls(b.win).filter((a) => a[0] === "event")
    expect(events).toEqual([
      ["event", "cta_click", { placement: "auditor_footer" }],
      ["event", "demo_step", { step: "risk" }],
      ["event", "section_view", { section: "evidence" }],
      ["event", "demo_export", {}],
      ["event", "demo_step", {}],
    ])
  })

  it("decline and withdrawal send nothing more and delete GA cookies", async () => {
    const b = fakeBrowser()
    const { ga, analytics } = await freshModules()
    ga.ga.write("denied")
    ga.ga.load(false)
    analytics.trackEvent("export_report")
    expect(b.scripts).toEqual([])
    expect(b.cookieWrites.some((c) => c.startsWith("_ga=") && c.includes("Max-Age=0"))).toBe(true)
    expect(b.cookieWrites.some((c) => c.startsWith("other="))).toBe(false)
  })

  it("an opted-out browser (?analytics=off) sends nothing to GA even with consent", async () => {
    const b = fakeBrowser()
    const { ga, analytics } = await freshModules()
    ga.ga.write("granted")
    ga.ga.load(false)
    b.store.set("ss:analytics-opt-out", "1")
    analytics.trackEvent("export_report")
    expect(gtagCalls(b.win).filter((a) => a[0] === "event")).toEqual([])
  })

  it("drops names outside the shared set and unsafe param values", async () => {
    const b = fakeBrowser()
    const { core } = await freshModules()
    const g = core.createGaConsent({ measurementId: "G-TEST", storageKey: "k", resetEvent: "r" })
    g.write("granted")
    g.load(false)
    g.track("page_view_custom", {})
    g.track("demo_x", { href: "https://x.test/?p=1", email: "a@b.c", ok: "risk", n: 3 })
    expect(gtagCalls(b.win).filter((a) => a[0] === "event")).toEqual([["event", "demo_x", { ok: "risk", n: 3 }]])
  })
})

describe("vendored core parity", () => {
  // Point GA_CORE_CANONICAL at the marketing site's src/lib/ga-consent-core.ts to run it.
  const canonical = process.env.GA_CORE_CANONICAL ? path.resolve(process.env.GA_CORE_CANONICAL) : ""
  it.skipIf(!canonical || !existsSync(canonical))("lib/ga-consent-core.ts is byte-identical to the canonical copy", () => {
    const vendored = readFileSync(path.resolve(__dirname, "../../lib/ga-consent-core.ts"), "utf8")
    expect(vendored).toBe(readFileSync(canonical, "utf8"))
  })
})
