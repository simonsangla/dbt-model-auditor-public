import { querySnowflake } from "@/lib/snowflake"
import { publicModeGuard } from "@/lib/public-mode"

export const dynamic = "force-dynamic"

export async function GET() {
  const blocked = publicModeGuard()
  if (blocked) return blocked
  try {
    const rows = await querySnowflake("SHOW WAREHOUSES")
    const warehouses = rows.map((r) => ({
      name: String(r.name ?? ""),
      state: String(r.state ?? ""),
      size: String(r.size ?? ""),
    }))
    return Response.json({ warehouses })
  } catch (e) {
    console.error(new Date().toISOString(), "[setup/warehouses]", e)
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to list warehouses" },
      { status: 500 },
    )
  }
}
