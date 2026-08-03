#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";
import { cliArgs } from "../cli-args.ts";
import { findMarkdownFiles, frontmatterLength } from "./md-files.ts";

const BULLET_LINE = /^(\t*)- /;

function processContent(content: string): string {
  const hasTrailingNewline = content.endsWith("\n");
  const usesCRLF = content.includes("\r\n");
  const lines = content.split(/\r\n|\n/);
  if (hasTrailingNewline) lines.pop();

  const frontmatterEnd = frontmatterLength(lines);
  const frontmatter = lines.slice(0, frontmatterEnd);
  const body = lines.slice(frontmatterEnd);

  const fixed: string[] = [];
  // Continuation lines share a block's tabs + 2 spaces, but their text
  // (e.g. pasted code with its own indentation) can itself start with
  // whitespace — so the fence must be aligned with the enclosing bullet,
  // not with whatever leading whitespace the glued line happens to have.
  let blockIndent = "";
  for (const line of body) {
    const bulletMatch = line.match(BULLET_LINE);
    if (bulletMatch) {
      blockIndent = `${bulletMatch[1]}  `;
      fixed.push(line);
      continue;
    }

    const trimmedEnd = line.replace(/[ \t]+$/, "");
    if (!trimmedEnd.endsWith("```") || trimmedEnd.slice(0, -3).trim() === "") {
      fixed.push(line); // no glued fence, or already alone on its own line
      continue;
    }

    fixed.push(trimmedEnd.slice(0, -3).replace(/[ \t]+$/, ""));
    fixed.push(`${blockIndent}\`\`\``);
  }

  const eol = usesCRLF ? "\r\n" : "\n";
  let result = [...frontmatter, ...fixed].join(eol);
  if (hasTrailingNewline) result += eol;
  return result;
}

const HELP = `fix-codeblock-endings — put codeblock closing fences on their own line

Usage:
  fix-codeblock-endings <directory>

Recursively finds all .md files under <directory>, leaves YAML frontmatter
untouched, and for every non-bullet line ending in "\`\`\`" that also has
other content before it, splits it in two: the content (minus the fence)
stays on its own line, and a new line containing just "\`\`\`" is inserted
after it, aligned with the block's opening "\`\`\`" (i.e. the enclosing
bullet's tabs plus 2 spaces).
`;

export async function fixCodeblockEndings(dir: string): Promise<void> {
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

  await fixCodeblockEndings(dir);
}

if (import.meta.main) main();
