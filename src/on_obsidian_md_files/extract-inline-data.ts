#!/usr/bin/env node

import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { randomBytes } from "crypto";
import { dirname, join } from "path";
import { cliArgs } from "../cli-args.ts";
import { findMarkdownFiles } from "./md-files.ts";

// Roam inlines pasted images as base64 data URIs instead of attachment
// files, e.g. "![](data:image/png;base64,iVBORw0KG...)" — Obsidian renders
// these fine, but they bloat the file and can't be opened/moved like a
// normal attachment.
const INLINE_DATA_IMAGE = /!\[[^\]]*\]\(data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)\)/g;

// Matches the 10-character, "A-Za-z0-9_-" style names Obsidian already
// generates for downloaded attachments (e.g. "M7ZN9RVfHB.jpg"), so extracted
// files fit right in alongside them.
const NAME_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const NAME_LENGTH = 10;

function randomFileName(): string {
  const bytes = randomBytes(NAME_LENGTH);
  let name = "";
  for (let i = 0; i < NAME_LENGTH; i++) name += NAME_ALPHABET[bytes[i] % NAME_ALPHABET.length];
  return name;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function extensionForMime(mime: string): string {
  const known = EXTENSION_BY_MIME[mime];
  if (known) return known;
  return mime.split("/")[1]?.split("+")[0] ?? "bin";
}

function uniqueFileName(dir: string, ext: string): string {
  let name: string;
  do {
    name = `${randomFileName()}.${ext}`;
  } while (existsSync(join(dir, name)));
  return name;
}

async function processFile(file: string): Promise<number> {
  const original = await readFile(file, "utf8");
  const matches = [...original.matchAll(INLINE_DATA_IMAGE)];
  if (matches.length === 0) return 0;

  const dir = dirname(file);
  let updated = "";
  let cursor = 0;
  for (const match of matches) {
    const [full, mime, data] = match;
    updated += original.slice(cursor, match.index);

    const name = uniqueFileName(dir, extensionForMime(mime));
    await writeFile(join(dir, name), Buffer.from(data.replace(/\s+/g, ""), "base64"));
    updated += `![[${name}]]`;

    cursor = match.index + full.length;
  }
  updated += original.slice(cursor);

  await writeFile(file, updated, "utf8");
  return matches.length;
}

const HELP = `extract-inline-data — turn inline base64 images into attachment files

Usage:
  extract-inline-data <directory>

Recursively finds all .md files under <directory> and, for each inline
image link with a base64 "data:" URI (e.g.
"![](data:image/png;base64,...)"), decodes it into a new file created
next to the .md file, named like Obsidian's own downloaded attachments
(a random 10-character "A-Za-z0-9_-" name plus an extension inferred
from the mime type), and replaces the data URI in place with a regular
embed link to that file, e.g. "![[M7ZN9RVfHB.png]]".
`;

export async function extractInlineData(dir: string): Promise<void> {
  const files = await findMarkdownFiles(dir);
  for (const file of files) {
    const count = await processFile(file);
    if (count > 0) {
      console.log(`Updated ${file} (extracted ${count} inline image${count === 1 ? "" : "s"})`);
    }
  }
}

async function main() {
  const [dir] = cliArgs();
  if (!dir) {
    console.log(HELP);
    process.exit(1);
  }

  await extractInlineData(dir);
}

if (import.meta.main) main();
