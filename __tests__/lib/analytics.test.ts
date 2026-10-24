import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }))
import { track } from "@vercel/analytics"
import {
  shouldRenderAnalytics,
  readOptOutFromSearch,
  isOptedOut,
  setOptOut,
  filterEvent,
  trackEvent,
  OPT_OUT_KEY,
} from "../../lib/analytics"

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  const storage = memoryStorage()
  vi.stubGlobal("window", { localStorage: storage })
})

describe("shouldRenderAnalytics", () => {
  it("is true only in Vercel production", () => {
    expect(shouldRenderAnalytics({ VERCEL_ENV: "production" })).toBe(true)
    expect(shouldRenderAnalytics({ VERCEL_ENV: "preview" })).toBe(false)
    expect(shouldRenderAnalytics({ VERCEL_ENV: "development" })).toBe(false)
    expect(shouldRenderAnalytics({})).toBe(false)
  })
})

describe("opt-out", () => {
  it("reads ?analytics=off|on", () => {
    expect(readOptOutFromSearch("?analytics=off")).toBe(true)
    expect(readOptOutFromSearch("?analytics=ON")).toBe(false)
    expect(readOptOutFromSearch("?analytics=x")).toBeNull()
    expect(readOptOutFromSearch("")).toBeNull()
  })
  it("persists in localStorage and can be cleared", () => {
    expect(isOptedOut()).toBe(false)
    setOptOut(true)
    expect(window.localStorage.getItem(OPT_OUT_KEY)).toBe("1")
    expect(isOptedOut()).toBe(true)
    setOptOut(false)
    expect(isOptedOut()).toBe(false)
  })
  it("fails open when storage throws", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => { throw new Error("blocked") } } })
    expect(isOptedOut()).toBe(false)
  })
})

describe("filterEvent (beforeSend)", () => {
  const ev = { type: "pageview", url: "https://x/" } as never
  it("passes events through when not opted out", () => {
    expect(filterEvent(ev)).toBe(ev)
  })
  it("drops events when opted out", () => {
    setOptOut(true)
    expect(filterEvent(ev)).toBeNull()
  })
})

describe("trackEvent", () => {
  it("sends allowed events", () => {
    trackEvent("export_report")
    expect(track).toHaveBeenCalledWith("export_report", undefined)
    trackEvent("step_nav", { step: "risk" })
    expect(track).toHaveBeenCalledWith("step_nav", { step: "risk" })
    trackEvent("bridge_click", { placement: "banner" })
    expect(track).toHaveBeenCalledWith("bridge_click", { placement: "banner" })
  })
  it("is a no-op when opted out", () => {
    setOptOut(true)
    trackEvent("export_report")
    expect(track).not.toHaveBeenCalled()
  })
  it("never sends a step id outside the five audit sections", () => {
    trackEvent("step_nav", { step: "my-secret-model-name" })
    expect(track).toHaveBeenCalledWith("step_nav", undefined)
  })
})

describe("createDepthTracker", () => {
  const sections = ["inputs", "evaluation", "risk", "recommendations", "evidence"]

  it("fires once per section reached, never for the first", async () => {
    const { createDepthTracker } = await import("../../lib/analytics")
    const reach = createDepthTracker(sections)
    reach(0)
    reach(1)
    reach(1)
    reach(2)
    reach(1)
    expect(vi.mocked(track).mock.calls).toEqual([
      ["scroll_depth", { step: "evaluation" }],
      ["scroll_depth", { step: "risk" }],
    ])
  })

  it("reports a section reached by a jump as that section only", async () => {
    const { createDepthTracker } = await import("../../lib/analytics")
    const reach = createDepthTracker(sections)
    reach(4)
    expect(vi.mocked(track).mock.calls).toEqual([["scroll_depth", { step: "evidence" }]])
  })

  it("sends nothing when opted out", async () => {
    const { createDepthTracker } = await import("../../lib/analytics")
    setOptOut(true)
    createDepthTracker(sections)(3)
    expect(track).not.toHaveBeenCalled()
  })
})
