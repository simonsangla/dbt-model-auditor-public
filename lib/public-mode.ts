/**
 * Public demo lock (SPEC V16). On the public Vercel deploy nothing may reach
 * Snowflake or spend Cortex credits: every route that can do so returns 403
 * before any SQL is built. Locked by default when VERCEL is set, so a deploy
 * that forgets the env var stays closed; only the exact string "false" opts out.
 */
type Env = Record<string, string | undefined>

export function isPublicDemoOnly(env: Env = process.env): boolean {
  const flag = env.PUBLIC_DEMO_ONLY
  if (flag === "false") return false
  if (flag === "true") return true
  return Boolean(env.VERCEL)
}

export function publicModeGuard(env: Env = process.env): Response | null {
  if (!isPublicDemoOnly(env)) return null
  return Response.json(
    { error: "This public deployment is demo-only: the recorded demo is available, live Snowflake connections are disabled." },
    { status: 403 },
  )
}
