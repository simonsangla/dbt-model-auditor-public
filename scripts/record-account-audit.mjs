#!/usr/bin/env node
// Bundles the anonymised method note of a snowflake-account-audit notebook run as
// the /account-audit demo (lib/account-audit-sample.json).
//
// Only the method note is taken: the notebook writes it as the one part of a run
// allowed to leave the account (rule, pass, severity, finding type; no object
// names, no values). The detailed note_audit stays in the account.
//
// usage:
//   node scripts/record-account-audit.mjs --connection <snow conn> --warehouse <WH> \
//     --workspace <DB.SCHEMA.WORKSPACE> [--run <runs/ folder name>]   (default: latest run with a report)
import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import path from "node:path"

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, v, i, all) => (v.startsWith("--") ? [...pairs, [v.slice(2), all[i + 1]]] : pairs), []),
)
for (const k of ["connection", "warehouse", "workspace"]) if (!args[k]) throw new Error(`missing --${k}`)

const sql = (q) =>
  execFileSync("snow", ["sql", "-c", args.connection, "--warehouse", args.warehouse, "--format", "json", "-q", q], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
const base = `snow://workspace/${args.workspace}/versions/live/runs/`

const listed = JSON.parse(sql(`LIST '${base}'`)).map((r) => r.name.split("/runs/")[1])
const withNote = [...new Set(listed.filter((p) => /\/report\/method_note_[\d-]+\.md$/.test(p)).map((p) => p.split("/")[0]))].sort()
const run = args.run ?? withNote.at(-1)
if (!run || !withNote.includes(run)) throw new Error(`no run with a method note${args.run ? `: ${args.run}` : ""}`)

const dir = mkdtempSync(path.join(tmpdir(), "account-audit-"))
sql(`GET '${base}${run}/report/' 'file://${dir}/'`)
const file = readdirSync(dir).find((f) => f.startsWith("method_note_"))
if (!file) throw new Error("method note not downloaded")
const methodNote = readFileSync(path.join(dir, file), "utf8")
if (!/No object names, no values/.test(methodNote)) throw new Error("not an anonymised method note: refusing to bundle it")

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const out = path.join(root, "lib/account-audit-sample.json")
writeFileSync(
  out,
  JSON.stringify(
    {
      note: "Anonymised method note of a real snowflake-account-audit run on the operator's own account. Regenerate with scripts/record-account-audit.mjs; never edit by hand.",
      run,
      file,
      methodNote,
    },
    null,
    1,
  ) + "\n",
)
console.log(JSON.stringify({ out, run, file, bytes: methodNote.length }))
