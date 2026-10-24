import { auditDbtManifest, type DbtManifest } from "@/lib/manifest-parser"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const json = (await req.json()) as DbtManifest
    if (!json || !json.nodes) {
      return Response.json(
        { error: "Invalid manifest.json payload (expected { nodes: ... })" },
        { status: 400 },
      )
    }

    const summary = auditDbtManifest(json)
    return Response.json(summary)
  } catch (e) {
    console.error(new Date().toISOString(), "[manifest]", e)
    return Response.json(
      { error: e instanceof Error ? e.message : "Failed to parse manifest" },
      { status: 500 },
    )
  }
}
