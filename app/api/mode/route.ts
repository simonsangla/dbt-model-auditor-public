import { isPublicDemoOnly } from "@/lib/public-mode"

export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json({ publicDemoOnly: isPublicDemoOnly() })
}
