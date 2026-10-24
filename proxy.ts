import { NextResponse, type NextRequest } from "next/server"
import { isPublicDemoOnly } from "@/lib/public-mode"

// Public demo shows three pages only; the rest redirect home before rendering.
export function proxy(request: NextRequest) {
  if (isPublicDemoOnly()) return NextResponse.redirect(new URL("/", request.url))
  return NextResponse.next()
}

export const config = { matcher: ["/cortex", "/battery", "/docs", "/setup"] }
