// French titles of the account-audit rules, for the operator restitution.
// English titles (lib/account-audit-rules.ts, generated) stay as the fallback.
import { RULE_TITLES } from "./account-audit-rules"

export const RULE_TITLES_FR: Record<string, string> = {
  R01: "Inférence Cortex inter-régions",
  R02: "Rôle CORTEX_USER accordé à PUBLIC",
  R03: "Politique réseau au niveau du compte",
  R04: "Rôle utilisé pour l'audit",
  R05: "Clés de la vue sémantique sur les tables référencées",
  R05b: "Clés primaires physiques",
  R06: "Rafraîchissement des tables dynamiques",
  R07: "Métriques et synonymes",
  R08: "Descriptions",
  R09: "Budget d'orchestration de l'agent",
  R10: "Instructions de l'agent",
  R11: "Modèle d'orchestration",
  R12: "État du service de recherche",
  R13: "Masquage et filtrage sur les tables de base",
  R14: "Agent accordé à PUBLIC",
  R15: "Budgets",
  R16: "Moniteur de ressources sur l'entrep\u00f4t de l'agent",
  R17: "Couverture de la lecture",
  R18: "Complétude du gel de l'existant",
  R19: "Ancien fichier de modèle sémantique",
  R20: "Privilège USE AI FUNCTIONS accordé à PUBLIC",
  R21: "Requêtes vérifiées de la vue sémantique",
  R22: "Versions de l'agent et brouillon actif",
  R23: "AI Gateway et AI_SETTINGS",
  R24: "Consommation de l'agent sur 30 jours",
  R25: "Jeux d'évaluation",
  R26: "Observabilité de l'agent sur 7 jours",
  R27: "Outils de l'agent et objets utilisés",
  R28: "Environnement de l'agent et de ses outils",
  R29: "Environnement d'exécution des outils Analyst",
  R30: "Valeurs d'exemple sur des colonnes personnelles (vue s\u00e9mantique)",
  R32: "R\u00f4les pouvant lire les questions et r\u00e9ponses stock\u00e9es",
  R33: "P\u00e9rim\u00e8tre du r\u00f4le de l'agent",
  R34: "R\u00f4les pouvant modifier l'agent ou la vue s\u00e9mantique",
}

/** French title, then English, then the row's own title, then the bare rule id. */
export function ruleTitle(rule: string, rowTitle: string): string {
  return RULE_TITLES_FR[rule] ?? RULE_TITLES[rule] ?? (rowTitle || rule)
}
