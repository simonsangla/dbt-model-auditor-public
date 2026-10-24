import { describe, it, expect } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { OperatorRestitution } from "../../components/operator-restitution"
import { readMethodNote } from "../../lib/account-audit-contract"
import SAMPLE from "../../lib/account-audit-sample.json"

const html = renderToStaticMarkup(<OperatorRestitution result={readMethodNote(SAMPLE.methodNote).result!} />)

describe("OperatorRestitution", () => {
  it("shows tool and operator verdicts side by side with the gap sentence", () => {
    expect(html).toContain("Verdict outil")
    expect(html).toContain("Verdict opérateur")
    expect(html).toContain("Pourquoi deux verdicts")
  })
  it("tags client decisions, groups by family, uses French titles, asks the limit reason", () => {
    expect(html).toContain("décision client à confirmer par écrit")
    expect(html).toContain("Compte et gouvernance")
    expect(html).toContain("Inférence Cortex inter-régions")
    expect(html).toContain("Raison de la limite pour R17")
  })
  it("offers the Markdown export and no score", () => {
    expect(html).toContain("Exporter la restitution")
    expect(html.toLowerCase()).not.toContain("score")
  })
})
