#!/usr/bin/env node
/**
 * Parses every migration and SQL test against the real PostgreSQL grammar.
 *
 * `libpg-query` embeds Postgres's own parser, so this catches genuine syntax
 * errors without a running database — which matters here because the RLS
 * policies are the primary authorization boundary and would otherwise reach a
 * live project completely unparsed.
 *
 * What this does NOT check:
 *   - plpgsql function bodies. To the SQL grammar a `$$ ... $$` body is an
 *     opaque string constant, so an error inside one is invisible here.
 *   - anything semantic: whether a column exists, whether a policy actually
 *     grants what it claims. That is what supabase/tests/0003_rls_verify.sql
 *     is for, and it needs a real database.
 *
 * Usage: npm run sql:check
 */

import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "libpg-query";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Byte cursor → line:col, so a failure points at something actionable. */
function locate(sql, cursor) {
  const upto = sql.slice(0, Math.max(0, cursor - 1));
  const line = upto.split("\n").length;
  const col = cursor - (upto.lastIndexOf("\n") + 1);
  return { line, col };
}

const files = [];
for await (const f of glob("supabase/**/*.sql", { cwd: ROOT })) {
  files.push(f);
}
files.sort();

if (files.length === 0) {
  console.error("No SQL files found under supabase/");
  process.exit(1);
}

await pg.loadModule();

let failed = 0;
let statements = 0;

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  const sql = readFileSync(abs, "utf8");
  try {
    const tree = await pg.parse(sql);
    const n = tree.stmts?.length ?? 0;
    statements += n;
    console.log(`  ok    ${rel}  (${n} statements)`);
  } catch (err) {
    failed++;
    const cursor = err?.cursorPosition ?? err?.cursorpos ?? 0;
    console.log(`  FAIL  ${rel}`);
    if (cursor) {
      const { line, col } = locate(sql, cursor);
      const lines = sql.split("\n");
      console.log(`        ${err.message} (line ${line}, col ${col})`);
      for (let i = Math.max(0, line - 2); i < Math.min(lines.length, line + 1); i++) {
        const marker = i + 1 === line ? ">" : " ";
        console.log(`      ${marker} ${String(i + 1).padStart(4)} | ${lines[i]}`);
      }
    } else {
      console.log(`        ${err.message}`);
    }
  }
}

console.log(
  failed === 0
    ? `\nAll ${files.length} SQL files parse (${statements} statements).`
    : `\n${failed} of ${files.length} SQL files failed to parse.`,
);
process.exit(failed ? 1 : 0);
