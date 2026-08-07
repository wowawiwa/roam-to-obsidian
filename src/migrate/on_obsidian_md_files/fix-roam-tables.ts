#!/usr/bin/env node

import { basename, dirname, extname, join } from "path";
import { readFile, writeFile } from "fs/promises";
import { cliArgs } from "../../common/cli-args.ts";
import { findMarkdownFiles, frontmatterLength } from "./md-files.ts";

const BULLET_LINE = /^(\t*)- (.*)$/;
const TABLE_MARKER = /^\{\{(\[\[table\]\]|table)\}\}$/;

// Roam stores a table as a chain, not a grid: {{table}}'s children are the
// rows, and within a row each further cell is normally the single child of
// the previous cell (depth increasing by exactly one tab per cell). Some
// cells additionally nest their own sub-outline (e.g. a cell with two
// children of its own, shown as a mini bulleted list inside that cell in
// Roam) — those extra branches don't line up with the chain, so they're
// folded into the last cell's text instead of becoming spurious columns.
// A line with no bullet marker is a continuation of whatever text (row or
// cell) most recently opened, from expand-line-breaks.
function tableRows(tableLines: string[], tableTabCount: number): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] | null = null;
  let nextCellDepth = tableTabCount + 1;

  for (const line of tableLines) {
    const match = line.match(BULLET_LINE);
    if (match) {
      const depth = match[1].length;
      const text = match[2];
      if (depth === tableTabCount + 1) {
        if (currentRow) rows.push(currentRow);
        currentRow = [text];
        nextCellDepth = tableTabCount + 2;
      } else if (currentRow && depth === nextCellDepth) {
        currentRow.push(text);
        nextCellDepth++;
      } else if (currentRow) {
        currentRow[currentRow.length - 1] += `<br>${text}`;
      }
    } else if (currentRow) {
      const text = line.replace(/^[ \t]*/, "");
      currentRow[currentRow.length - 1] += `<br>${text}`;
    }
  }
  if (currentRow) rows.push(currentRow);

  return rows;
}

function tableMarkdown(rows: string[][]): string {
  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  const escapeCell = (cell: string) => cell.replace(/\|/g, "\\|");
  const formatRow = (row: string[]) => {
    const padded = [...row];
    while (padded.length < columnCount) padded.push("");
    return `| ${padded.map(escapeCell).join(" | ")} |`;
  };

  const lines = [formatRow(rows[0])];
  lines.push(`| ${Array(columnCount).fill("---").join(" | ")} |`);
  for (const row of rows.slice(1)) lines.push(formatRow(row));
  return lines.join("\n") + "\n";
}

async function processFile(file: string): Promise<void> {
  const original = await readFile(file, "utf8");
  const hasTrailingNewline = original.endsWith("\n");
  const usesCRLF = original.includes("\r\n");
  const lines = original.split(/\r\n|\n/);
  if (hasTrailingNewline) lines.pop();

  const frontmatterEnd = frontmatterLength(lines);
  const frontmatter = lines.slice(0, frontmatterEnd);
  const body = lines.slice(frontmatterEnd);

  const fileBase = basename(file, extname(file));
  const fileDir = dirname(file);

  const newBody: string[] = [];
  let tableCount = 0;
  let i = 0;
  while (i < body.length) {
    const line = body[i];
    const bulletMatch = line.match(BULLET_LINE);
    if (!bulletMatch || !TABLE_MARKER.test(bulletMatch[2].trim())) {
      newBody.push(line);
      i++;
      continue;
    }

    const tableTabCount = bulletMatch[1].length;
    let end = i + 1;
    while (end < body.length) {
      const m = body[end].match(BULLET_LINE);
      if (m && m[1].length <= tableTabCount) break;
      end++;
    }

    tableCount++;
    const rows = tableRows(body.slice(i + 1, end), tableTabCount);
    const tableFileBase = `${fileBase}_table_${tableCount}`;
    if (rows.length > 0) {
      await writeFile(join(fileDir, `${tableFileBase}.md`), tableMarkdown(rows), "utf8");
      console.log(`Wrote ${join(fileDir, `${tableFileBase}.md`)}`);
    }
    newBody.push(`${bulletMatch[1]}- ![[${tableFileBase}]]`);
    i = end;
  }

  if (tableCount === 0) return;

  const eol = usesCRLF ? "\r\n" : "\n";
  let updated = [...frontmatter, ...newBody].join(eol);
  if (hasTrailingNewline) updated += eol;

  await writeFile(file, updated, "utf8");
  console.log(`Updated ${file}`);
}

const HELP = `fix-roam-tables — convert Roam {{table}} blocks to Obsidian tables

Usage:
  fix-roam-tables <directory>

Recursively finds all .md files under <directory>. For each "{{table}}" or
"{{[[table]]}}" block found:
  1. Creates a new file, "<file>_table_<N>.md" (N = order of appearance
     in the file), containing the block converted to a standard Markdown
     table.
  2. Replaces the table's lines in the original file with an Obsidian
     embed of that new file, keeping the original bullet's indentation.
`;

export async function fixRoamTables(dir: string): Promise<void> {
  const files = await findMarkdownFiles(dir);
  for (const file of files) {
    await processFile(file);
  }
}

async function main() {
  const [dir] = cliArgs();
  if (!dir) {
    console.log(HELP);
    process.exit(1);
  }

  await fixRoamTables(dir);
}

if (import.meta.main) main();
