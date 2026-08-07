#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";
import { cliArgs } from "../../common/cli-args.ts";
import { findMarkdownFiles } from "./md-files.ts";

// Roam attachment links carry the path they were downloaded under from
// Roam's storage (e.g. "Attachments/imgs/app/your-graph/foo.pdf"), but by the
// time this runs the attachment has been flattened to sit right next to
// whatever linked to it — so only that middle segment needs to go, e.g.
// "![[r/Attachments/imgs/app/your-graph/foo.pdf]]" becomes "![[r/foo.pdf]]".
const ATTACHMENT_PATH_SEGMENT = /Attachments\/imgs\/app\/[^/\]) ]+\//g;

const HELP = `fix-attachment-links — flatten Roam attachment links

Usage:
  fix-attachment-links <directory>

Recursively finds all .md files under <directory> and strips the
"Attachments/imgs/app/<account>/" segment out of any link that contains
it, leaving the rest of the link (prefix and filename) untouched.
`;

export async function fixAttachmentLinks(dir: string): Promise<void> {
  const files = await findMarkdownFiles(dir);
  for (const file of files) {
    const original = await readFile(file, "utf8");
    const updated = original.replace(ATTACHMENT_PATH_SEGMENT, "");
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

  await fixAttachmentLinks(dir);
}

if (import.meta.main) main();
