#!/usr/bin/env node

/**
 * Replace leading spaces by tabs.
 */

import { readFile, writeFile } from "fs/promises";
import { cliArgs } from "../cli-args.ts";
import { findMarkdownFiles, frontmatterLength } from "./md-files.ts";

function convertLeadingSpacesToTabs(line: string): string {
  const leading = line.match(/^[ \t]*/)![0];
  const rest = line.slice(leading.length);

  let result = "";
  let pendingSpaces = 0;
  for (const char of leading) {
    if (char === " ") {
      pendingSpaces++;
      if (pendingSpaces === 2) {
        result += "\t";
        pendingSpaces = 0;
      }
    } else {
      if (pendingSpaces === 1) result += " ";
      pendingSpaces = 0;
      result += "\t";
    }
  }
  if (pendingSpaces === 1) result += " ";

  return result + rest;
}

function countLeadingTabs(line: string): number {
  let count = 0;
  while (count < line.length && line[count] === "\t") count++;
  return count;
}

function processContent(content: string): string {
  const hasTrailingNewline = content.endsWith("\n");
  const usesCRLF = content.includes("\r\n");
  const lines = content.split(/\r\n|\n/);
  if (hasTrailingNewline) lines.pop();

  const frontmatterEnd = frontmatterLength(lines);
  const frontmatter = lines.slice(0, frontmatterEnd);
  const body = lines.slice(frontmatterEnd).filter((line) => line !== "");

  const converted = body.map(convertLeadingSpacesToTabs);

  const nonBlankTabCounts = converted
    .filter((line) => line.trim().length > 0)
    .map(countLeadingTabs);

  const commonTabs = nonBlankTabCounts.length > 0 ? Math.min(...nonBlankTabCounts) : 0;

  const dedented =
    commonTabs > 0
      ? converted.map((line) => {
        let toStrip = 0;
        while (toStrip < commonTabs && line[toStrip] === "\t") toStrip++;
        return line.slice(toStrip);
      })
      : converted;

  const eol = usesCRLF ? "\r\n" : "\n";
  let result = [...frontmatter, ...dedented].join(eol);
  if (hasTrailingNewline) result += eol;
  return result;
}

const HELP = `normalize-md-tabs — normalize indentation in Markdown files

Usage:
  normalize-md-tabs <directory>

Recursively finds all .md files under <directory>, leaves YAML frontmatter
untouched, and for the rest of the file:
  1. Removes empty lines.
  2. Converts every leading pair of 2 spaces into a tab.
  3. If every non-blank line in the file then starts with the same
     N tabs (N >= 1), strips those N leading tabs from every line.
`;

export async function normalizeLeadingTabs(dir: string): Promise<void> {
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

  await normalizeLeadingTabs(dir);
}

if (import.meta.main) main();
