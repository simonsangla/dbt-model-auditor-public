import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Building blocks for the `description` slot of AuditFlow. That slot sits on the
 * coloured header band (primary in light mode, a dark tint in dark mode) whose text
 * colour flips with the theme. Everything here inherits that colour through
 * `currentColor`, so nothing hard-codes a palette colour that can vanish on the band.
 */
export function HeaderMeta({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2 text-sm", className)}>{children}</div>
}

const CHIP = {
  outline: "border-current/40",
  solid: "border-transparent bg-current/15",
  notice: "border-current/60 bg-current/20 font-semibold",
} as const

export function HeaderChip({
  variant = "outline",
  mono = false,
  icon,
  children,
}: {
  variant?: keyof typeof CHIP
  mono?: boolean
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs",
        mono && "font-mono",
        CHIP[variant],
      )}
    >
      {icon}
      {children}
    </span>
  )
}

/** Plain line with an optional leading icon, in the header's own text colour. */
export function HeaderText({ icon, mono = false, children }: { icon?: ReactNode; mono?: boolean; children: ReactNode }) {
  return (
    <span className={cn("flex items-center gap-2", mono ? "font-mono text-xs" : "text-sm")}>
      {icon}
      {children}
    </span>
  )
}
