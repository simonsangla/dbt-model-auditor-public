// Consent-first Google Analytics 4 core, shared by every public site (#981).
//
// CANONICAL SOURCE: the marketing site repo, src/lib/ga-consent-core.ts. Vendored
// byte-identical into the auditor as lib/ga-consent-core.ts; a parity test there
// fails on divergence (GA_CORE_CANONICAL=<path to the canonical copy>). Site-specific config (measurement ID, storage key,
// event mapping) lives in each site's facade, never here. No framework imports.
//
// Behaviour, identical on every site:
// - Nothing is requested from Google and nothing is stored before the visitor
//   grants consent: gtag.js is injected only by load(), and the choice itself is
//   written to localStorage only when the visitor clicks.
// - Payloads are path-only: page_location / page_referrer are origin + pathname,
//   never the query string or fragment (UTM, prospect ids, emails).
// - Event names come from one closed set; params are primitives and any string
//   that looks like a URL, a query or an email is dropped.

export type Consent = "granted" | "denied"

/** The only GA4 custom event names any site may send. demo_* is a family. */
export const GA_EVENT_NAMES = [
    "cta_click",
    "cta_email",
    "book_call",
    "section_view"
] as const
const DEMO_EVENT = /^demo_[a-z0-9_]{1,32}$/

export type GaEventName = (typeof GA_EVENT_NAMES)[number] | `demo_${string}`
export type GaParams = Record<string, string | number | boolean>

export interface GaConsentConfig {
    /** GA4 measurement ID, e.g. "G-XXXXXXXXXX". */
    measurementId: string
    /** localStorage key that holds the visitor's choice. */
    storageKey: string
    /** window event dispatched by reset() so a mounted banner can reopen. */
    resetEvent: string
}

declare global {
    interface Window {
        dataLayer?: unknown[]
        gtag?: (...args: unknown[]) => void
    }
}

export function isAllowedEventName(name: string): name is GaEventName {
    return (
        (GA_EVENT_NAMES as readonly string[]).includes(name) ||
        DEMO_EVENT.test(name)
    )
}

const UNSAFE_STRING = /[?#@]|:\/\//

/** Primitive params only; strings carrying a URL, query or email are dropped. */
export function sanitizeParams(params?: Record<string, unknown>): GaParams {
    const safe: GaParams = {}
    if (!params) return safe
    for (const [key, value] of Object.entries(params)) {
        if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) continue
        if (typeof value === "number" && Number.isFinite(value))
            safe[key] = value
        else if (typeof value === "boolean") safe[key] = value
        else if (
            typeof value === "string" &&
            value.length <= 100 &&
            !UNSAFE_STRING.test(value)
        )
            safe[key] = value
    }
    return safe
}

/** origin + pathname of a URL; "" when it cannot be parsed. */
export function pathOnly(url: string): string {
    try {
        const u = new URL(url)
        return `${u.origin}${u.pathname}`
    } catch {
        return ""
    }
}

export function createGaConsent(config: GaConsentConfig) {
    const { measurementId, storageKey, resetEvent } = config
    let loaded = false

    /** The stored choice, or null when none was made (or storage throws). */
    function read(): Consent | null {
        if (typeof window === "undefined") return null
        try {
            const value = window.localStorage.getItem(storageKey)
            return value === "granted" || value === "denied" ? value : null
        } catch {
            return null
        }
    }

    function deleteGaCookies(): void {
        if (typeof document === "undefined") return
        const host = window.location.hostname
        const domains = new Set<string | undefined>([
            undefined,
            host,
            `.${host}`
        ])
        if (host.includes(".") && !/^\d+(?:\.\d+){3}$/.test(host)) {
            domains.add(`.${host.split(".").slice(-2).join(".")}`)
        }
        for (const cookie of document.cookie.split(";")) {
            const name = cookie.trim().split("=", 1)[0]
            if (!name.startsWith("_ga")) continue
            for (const domain of domains) {
                // biome-ignore lint/suspicious/noDocumentCookie: deletion must cover GA cookies in browsers without Cookie Store API
                document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`
            }
        }
    }

    /** Store or withdraw a choice; anything but "granted" also removes GA cookies. */
    function write(consent: Consent | null): void {
        if (typeof window === "undefined") return
        try {
            if (consent) window.localStorage.setItem(storageKey, consent)
            else window.localStorage.removeItem(storageKey)
        } catch {
            // Storage unavailable: the choice holds for this page view only.
        }
        if (consent !== "granted") deleteGaCookies()
    }

    /** Withdraw consent and notify the mounted banner to reopen. */
    function reset(): void {
        write(null)
        window.dispatchEvent(new Event(resetEvent))
    }

    /** Inject gtag.js once. Refuses unless consent is granted. */
    function load(debug: boolean): void {
        if (loaded || typeof document === "undefined") return
        if (read() !== "granted") return
        loaded = true
        window.dataLayer = window.dataLayer || []
        // gtag must push the Arguments object itself, not an array copy.
        window.gtag = function gtag() {
            // biome-ignore lint/complexity/noArguments: gtag.js reads the Arguments object
            window.dataLayer?.push(arguments)
        }
        const script = document.createElement("script")
        script.async = true
        script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
        document.head.appendChild(script)
        window.gtag("js", new Date())
        const page: GaParams = {
            page_location: pathOnly(window.location.href),
            page_referrer: document.referrer ? pathOnly(document.referrer) : ""
        }
        window.gtag(
            "config",
            measurementId,
            debug ? { ...page, debug_mode: true } : page
        )
    }

    /** Forward a closed-set event, sanitized, only after consent and load. */
    function track(name: string, params?: Record<string, unknown>): void {
        if (typeof window === "undefined") return
        if (!isAllowedEventName(name)) return
        if (read() !== "granted") return
        if (typeof window.gtag !== "function") return
        window.gtag("event", name, sanitizeParams(params))
    }

    return { measurementId, read, write, reset, load, track }
}

export type GaConsent = ReturnType<typeof createGaConsent>
