#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";
import { cliArgs } from "../cli-args.ts";
import { findMarkdownFiles, frontmatterLength } from "./md-files.ts";

const BULLET_LINE = /^\t*\*/;
const DASH_BULLET_LINE = /^[ \t]*- /;

function processContent(content: string, file: string): string {
  const hasTrailingNewline = content.endsWith("\n");
  const usesCRLF = content.includes("\r\n");
  const lines = content.split(/\r\n|\n/);
  if (hasTrailingNewline) lines.pop();

  const frontmatterEnd = frontmatterLength(lines);
  const frontmatter = lines.slice(0, frontmatterEnd);
  const body = lines.slice(frontmatterEnd);

  const converted = body.map((line, i) => {
    // Already in the target format (e.g. from a prior run) — leave as is.
    if (DASH_BULLET_LINE.test(line)) return line;

    const match = line.match(BULLET_LINE);
    if (!match) {
      throw new Error(
        `${file}:${frontmatterEnd + i + 1}: expected tabs then "*", got ${JSON.stringify(line)}`,
      );
    }
    const marker = match[0];
    return marker.slice(0, -1) + "-" + line.slice(marker.length);
  });

  const eol = usesCRLF ? "\r\n" : "\n";
  let result = [...frontmatter, ...converted].join(eol);
  if (hasTrailingNewline) result += eol;
  return result;
}

const HELP = `replace-bullet-asterisks — convert "*" list markers to "-"

Usage:
  replace-bullet-asterisks <directory>

Recursively finds all .md files under <directory>, leaves YAML frontmatter
untouched, and for every remaining line:
  1. If the line already starts with blanks followed by "- ", leaves it
     as is.
  2. Otherwise verifies the line starts with zero or more tabs followed
     by "*" (raises otherwise), and replaces that "*" with "-".
`;

export async function replaceBulletAsterisks(dir: string): Promise<void> {
  const files = await findMarkdownFiles(dir);
  for (const file of files) {
    const original = await readFile(file, "utf8");
    const updated = processContent(original, file);
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

  await replaceBulletAsterisks(dir);
}

if (import.meta.main) main();
