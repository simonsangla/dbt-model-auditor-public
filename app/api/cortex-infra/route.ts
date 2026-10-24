import { NextResponse } from "next/server"
import { parseConfigFromParams, validateConfig } from "@/lib/config"
import { auditCortexInfra } from "@/lib/cortex-infra-auditor"
import { publicModeGuard } from "@/lib/public-mode"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const blocked = publicModeGuard()
  if (blocked) return blocked
  const { searchParams } = new URL(request.url)
  const config = parseConfigFromParams(searchParams)
  if (!config) {
    return NextResponse.json({ error: "Missing required params: db, schema, wh" }, { status: 400 })
  }
  const invalid = validateConfig(config)
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 })
  }
  try {
    const result = await auditCortexInfra(config)
    const allFailed = result.checks.every((c) => c.status === "failed")
    // Nothing could be read: report the failure, not an empty inventory.
    if (allFailed) {
      return NextResponse.json(
        { error: result.checks.map((c) => `${c.name}: ${c.error}`).join("; "), checks: result.checks },
        { status: 502 },
      )
    }
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cortex infrastructure audit failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
