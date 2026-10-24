import Link from "next/link"

export interface Step {
  id: string
  label: string
}

function circleClass(i: number, current: number): string {
  return `w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
    i < current
      ? "bg-primary text-primary-foreground"
      : i === current
        ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
        : "bg-muted text-muted-foreground"
  }`
}

/**
 * Numbered progress steps. Without `steps` it renders the plain circles used by
 * the setup wizard; with `steps` each circle links to its section anchor.
 */
export function StepIndicator({
  current,
  total,
  steps,
  orientation = "horizontal",
}: {
  current: number
  total?: number
  steps?: Step[]
  orientation?: "horizontal" | "vertical"
}) {
  const count = steps?.length ?? total ?? 0

  if (orientation === "vertical" && steps) {
    return (
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Link
              href={`#${s.id}`}
              aria-current={i === current ? "step" : undefined}
              className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted ${
                i === current ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className={circleClass(i, current)}>{i + 1}</span>
              {s.label}
            </Link>
          </li>
        ))}
      </ol>
    )
  }

  // Linked steps stretch their connectors to the available width, so 5 steps fit a 320px phone.
  const row = (
    <div className={`flex items-center gap-2 ${steps ? "" : "mb-6"}`}>
      {Array.from({ length: count }, (_, i) => {
        const circle = <div className={circleClass(i, current)}>{i + 1}</div>
        return (
          <div key={i} className={`flex items-center gap-2 ${steps && i < count - 1 ? "flex-1" : ""}`}>
            {steps ? (
              <Link href={`#${steps[i].id}`} aria-label={steps[i].label} aria-current={i === current ? "step" : undefined}>
                {circle}
              </Link>
            ) : (
              circle
            )}
            {i < count - 1 && (
              <div className={`h-0.5 ${steps ? "min-w-2 flex-1" : "w-8"} ${i < current ? "bg-primary" : "bg-muted"}`} />
            )}
          </div>
        )
      })}
    </div>
  )
  if (!steps) return row
  return (
    <div className="mb-3">
      {row}
      <p aria-hidden="true" className="mt-1.5 text-xs text-muted-foreground">
        Step {current + 1} of {count}: <span className="font-medium text-foreground">{steps[current].label}</span>
      </p>
    </div>
  )
}
