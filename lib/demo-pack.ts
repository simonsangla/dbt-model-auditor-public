/**
 * Demo pack validator (SPEC V9, V10). A demo pack lives in demo-pack/<app>/ and
 * holds STORYBOARD.md + pack.json; it drives the product-demo-recording skill.
 * A pack is valid only if it is complete, placeholder-free, runs on labelled
 * synthetic data, and every scene points at a route the app really has.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const PLACEHOLDER = /\b(TODO|TBD|FIXME|lorem ipsum|lorem)\b|<[A-Z][A-Z_ ]*>/i

function routeExists(route: string, appRoot: string): boolean {
  const segments = route.split("?")[0].split("/").filter(Boolean)
  return existsSync(join(appRoot, "app", ...segments, "page.tsx"))
}

export function validateDemoPack(packDir: string, appRoot: string): string[] {
  const errors: string[] = []
  const storyPath = join(packDir, "STORYBOARD.md")
  const packPath = join(packDir, "pack.json")

  if (!existsSync(storyPath)) errors.push("STORYBOARD.md is missing")
  if (!existsSync(packPath)) return [...errors, "pack.json is missing"]

  const raw = readFileSync(packPath, "utf8")
  const story = existsSync(storyPath) ? readFileSync(storyPath, "utf8") : ""
  if (PLACEHOLDER.test(raw) || PLACEHOLDER.test(story)) errors.push("pack contains placeholder text (TODO, TBD, lorem or <FIELD>)")

  let pack: Record<string, any>
  try {
    pack = JSON.parse(raw)
  } catch {
    return [...errors, "pack.json is not valid JSON"]
  }

  for (const key of ["app", "audience", "outcome"]) {
    if (typeof pack[key] !== "string" || !pack[key].trim()) errors.push(`${key} must be a non-empty string`)
  }
  if (typeof pack.run?.command !== "string" || typeof pack.run?.url !== "string") errors.push("run.command and run.url are required")
  if (typeof pack.data?.source !== "string") errors.push("data.source is required")
  if (pack.data?.synthetic !== true && pack.data?.recorded !== true) {
    errors.push("data must be labelled: synthetic: true, or recorded: true for a recorded real run on public data")
  }

  if (!Array.isArray(pack.scenes) || pack.scenes.length === 0) {
    errors.push("scenes must be a non-empty array")
  } else {
    pack.scenes.forEach((s: Record<string, unknown>, i: number) => {
      for (const key of ["id", "route", "action", "proof", "caption"]) {
        if (typeof s?.[key] !== "string" || !(s[key] as string).trim()) errors.push(`scenes[${i}].${key} must be a non-empty string`)
      }
      if (typeof s?.route === "string" && !routeExists(s.route, appRoot)) errors.push(`scenes[${i}].route ${s.route} has no page in app/`)
    })
  }
  return errors
}
