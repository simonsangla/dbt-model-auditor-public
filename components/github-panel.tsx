"use client"

import { useQuery } from "@tanstack/react-query"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GitBranch, FileCode, TestTube, FileText, Wrench } from "lucide-react"

interface GitHubSummary {
  total: number
  models: number
  tests: number
  schemas: number
  macros: number
}

interface GitHubData {
  repo: string | null
  files: unknown[]
  summary: GitHubSummary | null
}

export function GitHubPanel({ params }: { params: string }) {
  const { data, isLoading, error } = useQuery<GitHubData>({
    queryKey: ["github", params],
    queryFn: async () => {
      const res = await fetch(`/api/github?${params}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      return body
    },
    retry: false,
    staleTime: 300_000,
  })

  if (isLoading) {
    return (
      <Card><CardContent className="p-6 text-center text-muted-foreground">Scanning GitHub repo...</CardContent></Card>
    )
  }

  if (error || !data?.summary) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Could not read the repository: {(error as Error | null)?.message ?? "no data"}. Set GITHUB_TOKEN for private repos.
        </CardContent>
      </Card>
    )
  }

  const s = data.summary

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          {data.repo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{s.models}</div>
              <div className="text-xs text-muted-foreground">Models</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TestTube className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{s.tests}</div>
              <div className="text-xs text-muted-foreground">Tests</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{s.schemas}</div>
              <div className="text-xs text-muted-foreground">Schema files</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{s.macros}</div>
              <div className="text-xs text-muted-foreground">Macros</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground max-w-[14rem]">
            File counts only. For test and documentation coverage, upload the project&apos;s manifest.json.
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
