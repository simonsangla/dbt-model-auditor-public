import { publicModeGuard } from "@/lib/public-mode"

export const dynamic = "force-dynamic"

const GITHUB_API = "https://api.github.com"

interface GitHubFile {
  name: string
  path: string
  type: "file" | "dir"
  download_url: string | null
}

async function fetchGitHub(path: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "dbt-model-auditor",
  }
  const token = process.env.GITHUB_TOKEN
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(`${GITHUB_API}${path}`, { headers, next: { revalidate: 300 } })
}

interface DbtProjectFile {
  path: string
  name: string
  type: "model" | "test" | "source" | "schema" | "macro" | "other"
}

function classifyFile(path: string): DbtProjectFile["type"] {
  if (path.endsWith(".yml") || path.endsWith(".yaml")) {
    if (path.includes("schema") || path.includes("_sources") || path.includes("/models/")) return "schema"
    return "other"
  }
  if (path.startsWith("models/") || path.includes("/models/")) return "model"
  if (path.startsWith("tests/") || path.includes("/tests/")) return "test"
  if (path.startsWith("macros/") || path.includes("/macros/")) return "macro"
  return "other"
}

async function listDbtFiles(repo: string, dir: string = ""): Promise<DbtProjectFile[]> {
  const files: DbtProjectFile[] = []
  const basePaths = ["models", "tests", "macros"]

  async function scanDir(path: string, depth = 0) {
    if (depth > 4) return
    const res = await fetchGitHub(`/repos/${repo}/contents/${path}`)
    // A missing folder is normal (not every project has tests/ or macros/).
    // Anything else (rate limit, auth, network) must surface, never read as "0 files".
    if (res.status === 404) return
    if (!res.ok) throw new Error(`GitHub API returned ${res.status} for ${repo}/${path}`)

    const items: GitHubFile[] = await res.json()
    if (!Array.isArray(items)) return

    for (const item of items) {
      if (item.type === "file" && (item.name.endsWith(".sql") || item.name.endsWith(".yml") || item.name.endsWith(".yaml"))) {
        if (!files.some((f) => f.path === item.path)) {
          files.push({ path: item.path, name: item.name, type: classifyFile(item.path) })
        }
      } else if (item.type === "dir") {
        await scanDir(item.path, depth + 1)
      }
    }
  }

  for (const p of basePaths) {
    const fullPath = dir ? `${dir}/${p}` : p
    await scanDir(fullPath)
  }

  return files
}

export async function GET(req: Request) {
  const blocked = publicModeGuard()
  if (blocked) return blocked
  try {
    const url = new URL(req.url)
    const repo = url.searchParams.get("repo")
    if (!repo) {
      return Response.json({ repo: null, files: [], summary: null })
    }
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
      return Response.json({ error: "repo must look like owner/name" }, { status: 400 })
    }

    const dir = url.searchParams.get("dir") || ""
    if (dir && !/^[A-Za-z0-9_.\/-]+$/.test(dir)) {
      return Response.json({ error: "Invalid dir" }, { status: 400 })
    }
    const files = await listDbtFiles(repo, dir)

    const modelCount = files.filter((f) => f.type === "model").length
    const testCount = files.filter((f) => f.type === "test").length
    const schemaCount = files.filter((f) => f.type === "schema").length
    const macroCount = files.filter((f) => f.type === "macro").length

    return Response.json({
      repo,
      files,
      summary: {
        total: files.length,
        models: modelCount,
        tests: testCount,
        schemas: schemaCount,
        macros: macroCount,
      },
    })
  } catch (e) {
    console.error(new Date().toISOString(), "[github]", e)
    return Response.json(
      { error: e instanceof Error ? e.message : "GitHub fetch failed" },
      { status: 502 },
    )
  }
}
