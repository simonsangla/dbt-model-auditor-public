"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Database } from "lucide-react"
import type { ModelInfo } from "@/lib/audit-engine"

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export function ModelsTable({ models }: { models: ModelInfo[] }) {

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Database className="h-5 w-5" />
          Models ({models.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Rows</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Last Altered</TableHead>
                <TableHead>Clustering</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((m) => (
                <TableRow key={m.name}>
                  <TableCell className="font-mono text-xs">{m.name}</TableCell>
                  <TableCell><Badge variant="outline">{m.kind}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{m.rows === null ? "view" : m.rows.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBytes(m.bytes)}</TableCell>
                  <TableCell className="text-xs">{m.lastAltered}</TableCell>
                  <TableCell>
                    {m.clusterBy ? (
                      <span className="text-xs font-mono">{m.clusterBy}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">{"\u2014"}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
