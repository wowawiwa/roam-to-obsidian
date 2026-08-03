#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";
import { cliArgs } from "../cli-args.ts";
import { findMarkdownFiles } from "./md-files.ts";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HELP = `fix-page-links — drop a directory segment out of vault-relative links

Usage:
  fix-page-links <directory> <import-dir-name>

Recursively finds all .md files under <directory> and strips
"<import-dir-name>/" out of any link that contains it — for use when
<import-dir-name>'s contents are being moved up into its parent, so
links like "[[r/<import-dir-name>/Some Page]]" need to become
"[[r/Some Page]]" to keep pointing at the right place.
`;

export async function fixPageLinks(dir: string, importDirName: string): Promise<void> {
  const pattern = new RegExp(`${escapeRegExp(importDirName)}/`, "g");
  const files = await findMarkdownFiles(dir);
  for (const file of files) {
    const original = await readFile(file, "utf8");
    const updated = original.replace(pattern, "");
    if (updated !== original) {
      await writeFile(file, updated, "utf8");
      console.log(`Updated ${file}`);
    }
  }
}

async function main() {
  const [dir, importDirName] = cliArgs();
  if (!dir || !importDirName) {
    console.log(HELP);
    process.exit(1);
  }

  await fixPageLinks(dir, importDirName);
}

if (import.meta.main) main();
