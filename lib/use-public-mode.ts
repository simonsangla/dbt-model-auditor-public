"use client"

import { useEffect, useState } from "react"

let pending: Promise<boolean> | null = null

// One request per page load, shared by every component. On failure assume locked: the safe default.
function fetchLocked(): Promise<boolean> {
  pending ??= fetch("/api/mode")
    .then((r) => r.json())
    .then((b) => b.publicDemoOnly !== false)
    .catch(() => true)
  return pending
}

/** null until /api/mode answers. */
export function usePublicMode(): boolean | null {
  const [locked, setLocked] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    fetchLocked().then((v) => alive && setLocked(v))
    return () => {
      alive = false
    }
  }, [])
  return locked
}
