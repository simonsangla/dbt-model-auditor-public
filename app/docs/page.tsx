"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  BookOpen,
  HelpCircle,
  Layers,
  FileCode,
  Database,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Search,
  ArrowLeft,
  Terminal,
  Zap,
  Flame,
  ExternalLink,
} from "lucide-react"

interface RuleDoc {
  id: string
  name: string
  severity: "error" | "warning" | "info"
  category: "Data Integrity" | "Snowflake Cost" | "dbt Architecture" | "Governance"
  description: string
  impact: string
  remediation: string
  exampleSql?: string
}

const AUDIT_RULES: RuleDoc[] = [
  {
    id: "empty-models",
    name: "Empty Models (0 Rows)",
    severity: "error",
    category: "Data Integrity",
    description: "Detects physical tables or materializations that have 0 rows in Snowflake.",
    impact: "Indicates broken upstream pipelines, empty source data, or failed tasks still incurring metadata overhead.",
    remediation: "Inspect the upstream dbt source or pipeline task, then run a full refresh of the model.",
    exampleSql: `dbt run --full-refresh --select stg_payments`,
  },
  {
    id: "direct-source-joins",
    name: "Direct Source Joins in Marts",
    severity: "warning",
    category: "dbt Architecture",
    description: "Flags downstream Marts (dim_*, fct_*) querying raw sources directly instead of consuming clean staging models (stg_*).",
    impact: "Violates dbt DAG layering. Causes schema coupling, repeated column renaming logic, and unstandardized data types.",
    remediation: "Create a staging model (stg_<source_table>.sql) for the raw source and ref() the staging model instead of source().",
    exampleSql: `-- Avoid in fct_orders.sql:\nSELECT * FROM {{ source('jaffle_shop', 'raw_customers') }}\n\n-- Recommended:\nSELECT * FROM {{ ref('stg_customers') }}`,
  },
  {
    id: "stale-models",
    name: "Zombie & Stale Models (>30 Days)",
    severity: "warning",
    category: "Snowflake Cost",
    description: "Identifies base tables (not views) whose LAST_ALTERED is more than 30 days old.",
    impact: "Either a scheduled dbt job stopped selecting the model, or the table is no longer used and still costs storage.",
    remediation: "Confirm whether a scheduled dbt job still selects the model before deciding anything. The auditor never recommends dropping a table.",
    exampleSql: `dbt ls --select obsolete_model`,
  },
  {
    id: "untested-models",
    name: "Untested Models (0 Tests in Manifest)",
    severity: "warning",
    category: "Governance",
    description: "Evaluates manifest.json to check if primary keys (e.g. unique, not_null) are tested.",
    impact: "Untested models risk silent data corruption, duplicate records, and broken BI dashboards.",
    remediation: "Add unique and not_null generic tests in your models/schema.yml file.",
    exampleSql: `version: 2\nmodels:\n  - name: dim_customers\n    columns:\n      - name: customer_id\n        tests:\n          - unique\n          - not_null`,
  },
  {
    id: "undocumented-models",
    name: "Missing Descriptions",
    severity: "info",
    category: "Governance",
    description: "Checks whether models have descriptions populated in dbt YAML files.",
    impact: "Poor developer experience, high onboarding friction, and missing context in enterprise data catalogs.",
    remediation: "Add human-readable descriptions in schema.yml or markdown doc blocks.",
    exampleSql: `version: 2\nmodels:\n  - name: int_customer_orders\n    description: "Intermediate join aggregating total lifetime spend per customer."`,
  },
  {
    id: "naming-conventions",
    name: "dbt Naming Conventions Violation",
    severity: "warning",
    category: "dbt Architecture",
    description: "Verifies that model file names start with standard prefixes: stg_, int_, fct_, dim_, rpt_, snap_.",
    impact: "Non-standard names make lineage comprehension and layer-based dbt selectors (e.g. dbt run --select stg_*) difficult.",
    remediation: "Rename model files to match their layer prefix according to dbt best practices.",
  },
  {
    id: "unclustered-tables",
    name: "Large Unclustered Tables (>100MB)",
    severity: "warning",
    category: "Snowflake Cost",
    description: "Identifies large tables with significant storage size that lack a clustering key.",
    impact: "Full partition scans increase Snowflake virtual warehouse credit consumption and query latency.",
    remediation: "Configure cluster_by parameter in dbt model configuration on frequently filtered date or ID columns.",
    exampleSql: `{{ config(\n    materialized='table',\n    cluster_by=['order_date', 'customer_id']\n) }}`,
  },
  {
    id: "dbt-model-not-built",
    name: "dbt Model Missing in Snowflake",
    severity: "warning",
    category: "dbt Architecture",
    description: "With a manifest loaded: a model the manifest builds into the audited schema (matched by database, schema and alias) has no table or view in Snowflake. Ephemeral models are skipped.",
    impact: "The model was never built, failed its last build, or was built somewhere else, so anything that selects from it breaks or reads stale data.",
    remediation: "Build it and check where it lands. Loading a manifest also narrows the whole audit and its score to dbt models only.",
    exampleSql: `dbt build --select fct_payments`,
  },
  {
    id: "no-primary-key",
    name: "Base Tables Without a Primary Key",
    severity: "info",
    category: "Data Integrity",
    description: "Lists base tables in the configured schema that SHOW PRIMARY KEYS reports no key for. Views are ignored.",
    impact: "Snowflake does not enforce primary keys, so this never lowers the score; a declared key (RELY) documents the table's grain and can help join planning.",
    remediation: "Declare the key from the dbt model so it survives rebuilds. If SHOW PRIMARY KEYS is refused, the check is reported as 'could not run', never as zero findings.",
    exampleSql: `{{ config(\n    post_hook="ALTER TABLE {{ this }} ADD PRIMARY KEY (order_id) RELY"\n) }}`,
  },
  {
    id: "recent-failure",
    name: "Recent Query Failures (7 Days)",
    severity: "error",
    category: "Data Integrity",
    description: "Lists failed queries against the target schema in SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY over the last 7 days.",
    impact: "Repeated failures usually mean a broken model or a permission change upstream.",
    remediation: "Needs read access to SNOWFLAKE.ACCOUNT_USAGE. Without it the check is reported as 'could not run', never as zero failures.",
  },
  {
    id: "slow-query",
    name: "Slow Queries (>60s, 7 Days)",
    severity: "warning",
    category: "Snowflake Cost",
    description: "Lists queries against the target schema that took more than 60 seconds in the last 7 days (ACCOUNT_USAGE.QUERY_HISTORY).",
    impact: "Long-running queries drive warehouse credit consumption and delay downstream refreshes.",
    remediation: "Needs read access to SNOWFLAKE.ACCOUNT_USAGE. Without it the check is reported as 'could not run', never as zero slow queries.",
  },
]

const GLOSSARY_TERMS = [
  {
    term: "Sources",
    prefix: "source('name', 'table')",
    layer: "Sources",
    description: "Raw ingested data from upstream databases, APIs, or event streams. Configured in YAML; never transformed directly.",
  },
  {
    term: "Staging Models",
    prefix: "stg_<source>_<entity>.sql",
    layer: "Staging",
    description: "1-to-1 models that clean, cast datatypes, and rename columns from raw sources. No joins or business logic allowed.",
  },
  {
    term: "Intermediate Models",
    prefix: "int_<entity>_<verb>.sql",
    layer: "Intermediate",
    description: "Models that join multiple staging tables and apply complex business transformations before final marts.",
  },
  {
    term: "Marts (Facts & Dimensions)",
    prefix: "fct_*.sql / dim_*.sql",
    layer: "Marts",
    description: "Analytics-ready dimensional models (Kimball architecture) designed for fast BI reporting and ad-hoc SQL queries.",
  },
  {
    term: "Seeds",
    prefix: "data/*.csv",
    layer: "Raw",
    description: "Static CSV files committed into the git repository (e.g., country code mappings, marketing channel groupings).",
  },
  {
    term: "Snapshots",
    prefix: "snapshots/*.sql",
    layer: "Governance",
    description: "Type-2 Slowly Changing Dimension (SCD2) tables tracking historical row updates over time.",
  },
  {
    term: "Exposures",
    prefix: "exposures.yml",
    layer: "Governance",
    description: "Metadata declarations specifying downstream consumer applications (e.g. Tableau dashboards, ML models, reverse ETL).",
  },
  {
    term: "Semantic Layer",
    prefix: "metrics/*.yml",
    layer: "Marts",
    description: "Centralized metric definitions (e.g., Monthly Recurring Revenue, Churn Rate) ensuring uniform calculations across tools.",
  },
]

export default function DocsPage() {
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  const filteredRules = AUDIT_RULES.filter((rule) => {
    const matchesSearch =
      search === "" ||
      rule.name.toLowerCase().includes(search.toLowerCase()) ||
      rule.description.toLowerCase().includes(search.toLowerCase()) ||
      rule.impact.toLowerCase().includes(search.toLowerCase())

    const matchesCategory =
      selectedCategory === "all" || rule.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  const filteredGlossary = GLOSSARY_TERMS.filter((item) => {
    return (
      search === "" ||
      item.term.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase())
    )
  })

  return (
    <main className="w-full py-8 px-4 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1 text-primary dark:text-primary">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5 pt-1">
            <BookOpen className="h-6 w-6 text-primary dark:text-primary" />
            Audit Rules Catalog & dbt Architecture Glossary
          </h1>
          <p className="text-sm text-muted-foreground">
            Authoritative guide to Snowflake runtime cost optimization, dbt-project-evaluator heuristics, and DAG architecture.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/setup">
            <Button variant="outline" size="sm" className="text-xs">
              Configure Connection
            </Button>
          </Link>
        </div>
      </div>

      {/* Search & Quick Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search rules, SQL examples, or glossary..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {["all", "Data Integrity", "Snowflake Cost", "dbt Architecture", "Governance"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                selectedCategory === cat
                  ? "bg-primary text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat === "all" ? "All Categories" : cat}
            </button>
          ))}
        </div>
      </div>

      {/* Section 1: Rules Reference */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <FileCode className="h-5 w-5 text-primary dark:text-primary" />
              Bug Finder Rules Reference ({filteredRules.length})
            </h2>
            <p className="text-xs text-muted-foreground">
              Executed concurrently by the zero-lag INFORMATION_SCHEMA runner and manifest analyzer.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRules.map((rule) => {
            let severityBadge = (
              <Badge variant="outline" className="bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20 text-[10px]">
                INFO
              </Badge>
            )
            if (rule.severity === "error") {
              severityBadge = (
                <Badge variant="destructive" className="text-[10px] bg-destructive">
                  CRITICAL BUG
                </Badge>
              )
            } else if (rule.severity === "warning") {
              severityBadge = (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30 text-[10px] font-bold">
                  WARNING
                </Badge>
              )
            }

            return (
              <Card key={rule.id} className="border shadow-2xs flex flex-col justify-between">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {rule.category}
                      </Badge>
                      <CardTitle className="text-base font-bold">{rule.name}</CardTitle>
                    </div>
                    <div>{severityBadge}</div>
                  </div>
                  <CardDescription className="text-xs pt-1">{rule.description}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-3 text-xs pt-0">
                  <div className="p-2.5 bg-muted/40 rounded-lg space-y-1">
                    <span className="font-semibold text-muted-foreground block text-[11px]">
                      💥 Impact / Blast Risk:
                    </span>
                    <p className="text-foreground/90">{rule.impact}</p>
                  </div>

                  <div className="p-2.5 bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-lg space-y-1">
                    <span className="font-semibold text-primary dark:text-primary text-[11px] flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Recommended Remediation:
                    </span>
                    <p className="text-foreground/90">{rule.remediation}</p>
                  </div>

                  {rule.exampleSql && (
                    <div className="space-y-1">
                      <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                        <Terminal className="h-3 w-3 text-primary" /> 1-Click Code Example:
                      </span>
                      <pre className="p-2.5 bg-slate-950 text-slate-100 rounded-md font-mono text-[11px] overflow-x-auto">
                        {rule.exampleSql}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Section 2: dbt Architecture Glossary */}
      <div className="space-y-4 pt-4 border-t">
        <div className="space-y-0.5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary dark:text-primary" />
            dbt Architecture & Layering Glossary
          </h2>
          <p className="text-xs text-muted-foreground">
            Standard conventions for structuring maintainable, high-performance dbt analytics engineering pipelines.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredGlossary.map((item) => (
            <Card key={item.term} className="border shadow-2xs">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {item.layer}
                  </Badge>
                </div>
                <CardTitle className="text-sm font-bold pt-1">{item.term}</CardTitle>
                <div className="font-mono text-[10px] text-primary dark:text-primary truncate">
                  {item.prefix}
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                <p>{item.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  )
}
