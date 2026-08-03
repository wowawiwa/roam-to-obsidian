#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";
import { cliArgs } from "../cli-args.ts";
import { LINE_BREAK_PLACEHOLDER } from "../config.ts";
import { findMarkdownFiles, frontmatterLength } from "./md-files.ts";

const BULLET_LINE = /^(\t*)- (.*)$/;
const QUOTE_PREFIX = /^(>[ \t]*)/;

function processContent(content: string): string {
  const hasTrailingNewline = content.endsWith("\n");
  const usesCRLF = content.includes("\r\n");
  const lines = content.split(/\r\n|\n/);
  if (hasTrailingNewline) lines.pop();

  const frontmatterEnd = frontmatterLength(lines);
  const frontmatter = lines.slice(0, frontmatterEnd);
  const body = lines.slice(frontmatterEnd);

  const expanded = body.flatMap((line) => {
    const match = line.match(BULLET_LINE);
    if (!match || !match[2].includes(LINE_BREAK_PLACEHOLDER)) return [line];

    const [, indent, text] = match;
    const quoteMatch = text.match(QUOTE_PREFIX);
    const quotePrefix = quoteMatch ? quoteMatch[1] : "";
    const rest = quoteMatch ? text.slice(quotePrefix.length) : text;

    const [first, ...segments] = rest.split(LINE_BREAK_PLACEHOLDER);
    return [
      `${indent}- ${quotePrefix}${first}`,
      ...segments.map((segment) => `${indent}  ${quotePrefix}${segment}`),
    ];
  });

  const eol = usesCRLF ? "\r\n" : "\n";
  let result = [...frontmatter, ...expanded].join(eol);
  if (hasTrailingNewline) result += eol;
  return result;
}

const HELP = `expand-line-breaks — expand the line-break placeholder into indented lines

Usage:
  expand-line-breaks <directory>

Recursively finds all .md files under <directory>, leaves YAML frontmatter
untouched, and for every list item line whose text contains
"${LINE_BREAK_PLACEHOLDER}" (the marker replace-roam-linebreaks left in
place of a real line break), splits it into multiple lines: the bullet
line keeps the text before the first placeholder, and each remaining
segment becomes its own line indented with the bullet's own leading tabs
plus two spaces. If the bullet's text is a quote (starts with ">"), that
quote marker is repeated at the start of every resulting line.
`;

export async function expandLineBreaks(dir: string): Promise<void> {
  const files = await findMarkdownFiles(dir);
  for (const file of files) {
    const original = await readFile(file, "utf8");
    const updated = processContent(original);
    if (updated !== original) {
      await writeFile(file, updated, "utf8");
      console.log(`Updated ${file}`);
    }
  }
}

async function main() {
  const [dir] = cliArgs();
  if (!dir) {
    console.log(HELP);
    process.exit(1);
  }

  await expandLineBreaks(dir);
}

if (import.meta.main) main();
