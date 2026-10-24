import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }))
import { track } from "@vercel/analytics"
import {
  shouldRenderAnalytics,
  readOptOutFromSearch,
  isOptedOut,
  setOptOut,
  syncOptOutFromSearch,
  filterEvent,
  createTracker,
  createDepthTracker,
  OPT_OUT_KEY,
} from "../../lib/analytics-core"

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
  vi.stubGlobal("window", { localStorage: memoryStorage() })
})

const SCHEMA = { export_report: {}, step_nav: { step: ["inputs", "risk"] }, scroll_depth: { step: ["inputs", "risk"] } } as const

describe("shouldRenderAnalytics", () => {
  it("is true only in Vercel production", () => {
    expect(shouldRenderAnalytics({ VERCEL_ENV: "production" })).toBe(true)
    expect(shouldRenderAnalytics({ VERCEL_ENV: "preview" })).toBe(false)
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
    setOptOut(false)
    expect(isOptedOut()).toBe(false)
  })
  it("syncs from the query string", () => {
    expect(syncOptOutFromSearch("?analytics=off")).toBe(true)
    expect(syncOptOutFromSearch("")).toBe(true)
    expect(syncOptOutFromSearch("?analytics=on")).toBe(false)
  })
  it("fails open when storage throws", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => { throw new Error("blocked") } } })
    expect(isOptedOut()).toBe(false)
  })
})

describe("filterEvent (beforeSend)", () => {
  const ev = { type: "pageview", url: "https://x/" } as never
  it("passes events through, drops them when opted out", () => {
    expect(filterEvent(ev)).toBe(ev)
    setOptOut(true)
    expect(filterEvent(ev)).toBeNull()
  })
})

describe("createTracker", () => {
  it("sends known events with allowed values", () => {
    const trackEvent = createTracker(SCHEMA)
    trackEvent("export_report")
    expect(track).toHaveBeenCalledWith("export_report", undefined)
    trackEvent("step_nav", { step: "risk" })
    expect(track).toHaveBeenCalledWith("step_nav", { step: "risk" })
  })
  it("drops a value outside the closed set but still sends the event", () => {
    createTracker(SCHEMA)("step_nav", { step: "my-secret-model-name" })
    expect(track).toHaveBeenCalledWith("step_nav", undefined)
  })
  it("sends nothing for an event the schema does not define", () => {
    createTracker(SCHEMA)("not_in_schema" as never)
    expect(track).not.toHaveBeenCalled()
  })
  it("is a no-op when opted out", () => {
    setOptOut(true)
    createTracker(SCHEMA)("export_report")
    expect(track).not.toHaveBeenCalled()
  })
})

describe("createDepthTracker", () => {
  const ids = ["inputs", "evaluation", "risk"]
  it("fires once per index after the first, never repeats", () => {
    const send = vi.fn()
    const reach = createDepthTracker(ids, send)
    reach(0)
    reach(1)
    reach(1)
    reach(2)
    reach(1)
    expect(send.mock.calls).toEqual([["evaluation"], ["risk"]])
  })
  it("reports a jump as the section reached only", () => {
    const send = vi.fn()
    createDepthTracker(ids, send)(2)
    expect(send.mock.calls).toEqual([["risk"]])
  })
  it("ignores out-of-range indexes", () => {
    const send = vi.fn()
    const reach = createDepthTracker(ids, send)
    reach(-1)
    reach(9)
    expect(send).not.toHaveBeenCalled()
  })
})
