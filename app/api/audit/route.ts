import { querySnowflake } from "@/lib/snowflake"
import { parseConfigFromParams, validateConfig } from "@/lib/config"
import { runAudit, CORE_RULES } from "@/lib/audit-engine"
import { publicModeGuard } from "@/lib/public-mode"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const blocked = publicModeGuard()
  if (blocked) return blocked
  try {
    const url = new URL(req.url)
    const config = parseConfigFromParams(url.searchParams)
    if (!config) {
      return Response.json(
        { error: "Missing required params: db, schema, wh" },
        { status: 400 },
      )
    }
    const invalid = validateConfig(config)
    if (invalid) {
      return Response.json({ error: invalid }, { status: 400 })
    }

    const result = await runAudit(
      (sql, opts) => querySnowflake(sql, { callersRights: true, warehouse: opts?.warehouse }),
      config,
      CORE_RULES,
    )

    return Response.json(result)
  } catch (e) {
    console.error(new Date().toISOString(), "[audit]", e)
    return Response.json(
      { error: e instanceof Error ? e.message : "Audit failed" },
      { status: 502 },
    )
  }
}
