/** Pages shown on the public demo (SPEC V16). Everything else is hidden and redirected to /. */
export const PUBLIC_PATHS = ["/", "/lineage", "/trust", "/account-audit"] as const

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname)
}
