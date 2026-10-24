import { querySnowflake } from "@/lib/snowflake"
import { isIdentifier } from "@/lib/config"
import { publicModeGuard } from "@/lib/public-mode"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const blocked = publicModeGuard()
  if (blocked) return blocked
  try {
    const url = new URL(req.url)
    const db = url.searchParams.get("db")
    if (!db) {
      return Response.json({ error: "Missing 'db' parameter" }, { status: 400 })
    }
    if (!isIdentifier(db)) {
      return Response.json({ error: "Invalid database name" }, { status: 400 })
    }

    const rows = await querySnowflake(`SHOW SCHEMAS IN DATABASE ${db}`)
    const schemas = rows
      .filter((r) => String(r.name ?? "") !== "INFORMATION_SCHEMA")
      .map((r) => ({
        name: String(r.name ?? ""),
        comment: String(r.comment ?? ""),
      }))
    return Response.json({ schemas })
  } catch (e) {
    console.error(new Date().toISOString(), "[setup/schemas]", e)
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to list schemas" },
      { status: 500 },
    )
  }
}
