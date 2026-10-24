import { runCortexAudit, isCortexModel, isCortexTask, type CortexAuditRequest } from "@/lib/cortex"
import { isIdentifier } from "@/lib/config"
import { publicModeGuard } from "@/lib/public-mode"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const blocked = publicModeGuard()
  if (blocked) return blocked
  try {
    const body = (await req.json()) as Partial<CortexAuditRequest>

    if (!body.modelName || !body.sqlCode || !body.task) {
      return Response.json(
        { error: "Missing required fields: modelName, sqlCode, task" },
        { status: 400 },
      )
    }

    if (!isCortexTask(body.task)) {
      return Response.json({ error: "Unsupported task" }, { status: 400 })
    }
    if (body.cortexModel !== undefined && !isCortexModel(body.cortexModel)) {
      return Response.json({ error: "Unsupported Cortex model" }, { status: 400 })
    }
    if (body.warehouse !== undefined && !isIdentifier(body.warehouse)) {
      return Response.json({ error: "Invalid warehouse name" }, { status: 400 })
    }

    const response = await runCortexAudit({
      modelName: body.modelName,
      sqlCode: body.sqlCode,
      task: body.task,
      cortexModel: body.cortexModel,
      warehouse: body.warehouse,
    })

    return Response.json(response)
  } catch (e) {
    console.error(new Date().toISOString(), "[cortex-api]", e)
    return Response.json(
      { error: e instanceof Error ? e.message : "Cortex AI analysis failed" },
      { status: 502 },
    )
  }
}
