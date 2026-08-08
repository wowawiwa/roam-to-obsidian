#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";
import { cliArgs } from "../../common/cli-args.ts";
import { findMarkdownFiles, frontmatterLength } from "./md-files.ts";

const BULLET_LINE = /^(\t*)- (.*)$/;
const MERMAID_MARKER = /^\{\{(\[\[mermaid\]\]|mermaid)\}\}$/;

// Roam renders {{mermaid}}'s child blocks as the lines of the diagram,
// with deeper nesting shown as indentation. A line with no bullet marker
// is a continuation of the block above it, from expand-line-breaks, and
// keeps that block's indentation.
function mermaidLines(blockLines: string[], markerTabCount: number): string[] {
  const lines: string[] = [];
  let indent = "";
  for (const line of blockLines) {
    const match = line.match(BULLET_LINE);
    if (match) {
      indent = "  ".repeat(Math.max(0, match[1].length - markerTabCount - 1));
      lines.push(indent + match[2]);
    } else {
      lines.push(indent + line.replace(/^[ \t]*/, ""));
    }
  }
  return lines;
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

  const newBody: string[] = [];
  let mermaidCount = 0;
  let i = 0;
  while (i < body.length) {
    const line = body[i];
    const bulletMatch = line.match(BULLET_LINE);
    if (!bulletMatch || !MERMAID_MARKER.test(bulletMatch[2].trim())) {
      newBody.push(line);
      i++;
      continue;
    }

    const markerTabCount = bulletMatch[1].length;
    let end = i + 1;
    while (end < body.length) {
      const m = body[end].match(BULLET_LINE);
      if (m && m[1].length <= markerTabCount) break;
      end++;
    }

    mermaidCount++;
    const blockIndent = `${bulletMatch[1]}  `;
    newBody.push(`${bulletMatch[1]}- \`\`\`mermaid`);
    for (const diagramLine of mermaidLines(body.slice(i + 1, end), markerTabCount)) {
      newBody.push(`${blockIndent}${diagramLine}`);
    }
    newBody.push(`${blockIndent}\`\`\``);
    i = end;
  }

  if (mermaidCount === 0) return;

  const eol = usesCRLF ? "\r\n" : "\n";
  let updated = [...frontmatter, ...newBody].join(eol);
  if (hasTrailingNewline) updated += eol;

  await writeFile(file, updated, "utf8");
  console.log(`Updated ${file}`);
}

const HELP = `fix-roam-mermaid — convert Roam {{mermaid}} blocks to Obsidian mermaid codeblocks

Usage:
  fix-roam-mermaid <directory>

Recursively finds all .md files under <directory>. For each "{{mermaid}}"
or "{{[[mermaid]]}}" block found, replaces the marker bullet and its
children with a "\`\`\`mermaid" codeblock at the marker bullet's
indentation: each child block becomes one line of the diagram, with
nesting below the first child level turned into two spaces of
indentation per level.
`;

export async function fixRoamMermaid(dir: string): Promise<void> {
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

  await fixRoamMermaid(dir);
}

if (import.meta.main) main();
