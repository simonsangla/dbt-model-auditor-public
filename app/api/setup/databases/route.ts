import { querySnowflake } from "@/lib/snowflake"
import { publicModeGuard } from "@/lib/public-mode"

export const dynamic = "force-dynamic"

export async function GET() {
  const blocked = publicModeGuard()
  if (blocked) return blocked
  try {
    const rows = await querySnowflake("SHOW DATABASES")
    const databases = rows
      .filter((r) => String(r.name ?? "") !== "SNOWFLAKE")
      .map((r) => ({
        name: String(r.name ?? ""),
        kind: String(r.kind ?? ""),
        comment: String(r.comment ?? ""),
      }))
    return Response.json({ databases })
  } catch (e) {
    console.error(new Date().toISOString(), "[setup/databases]", e)
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to list databases" },
      { status: 500 },
    )
  }
}
