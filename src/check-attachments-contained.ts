#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { cliArgs } from "./cli-args.ts";

const HELP = `check-attachments-contained — verify every file in one directory
already exists (same name, same content) somewhere in another directory

Usage:
  check-attachments-contained <sourceDir> <targetDir>

Recursively walks <sourceDir> and, for each file, looks for a file with
the same name anywhere under <targetDir> and compares their contents by
hash. Reports any file that's missing from <targetDir> or that has a
same-named counterpart with different content, then exits non-zero.
Useful for confirming it's safe to delete <sourceDir> because everything
in it already made it into <targetDir> (e.g. a downloaded attachments
folder vs. an Obsidian vault).
`;

async function walkFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function buildNameIndex(dir: string): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>();
  for (const path of await walkFiles(dir)) {
    const name = basename(path);
    const paths = index.get(name);
    if (paths) paths.push(path);
    else index.set(name, [path]);
  }
  return index;
}

async function findMatchingContent(sourcePath: string, candidates: string[]): Promise<boolean> {
  const sourceSize = (await stat(sourcePath)).size;
  const sameSize: string[] = [];
  for (const candidate of candidates) {
    if ((await stat(candidate)).size === sourceSize) sameSize.push(candidate);
  }
  if (sameSize.length === 0) return false;

  const sourceHash = await hashFile(sourcePath);
  for (const candidate of sameSize) {
    if ((await hashFile(candidate)) === sourceHash) return true;
  }
  return false;
}

export interface ContainmentResult {
  checked: number;
  missing: string[];
  mismatched: string[];
}

export async function checkAttachmentsContained(
  sourceDir: string,
  targetDir: string,
): Promise<ContainmentResult> {
  const sourceFiles = await walkFiles(sourceDir);
  const targetIndex = await buildNameIndex(targetDir);

  const missing: string[] = [];
  const mismatched: string[] = [];

  for (const sourcePath of sourceFiles) {
    const candidates = targetIndex.get(basename(sourcePath));
    if (!candidates) {
      missing.push(sourcePath);
      continue;
    }
    if (!(await findMatchingContent(sourcePath, candidates))) {
      mismatched.push(sourcePath);
    }
  }

  return { checked: sourceFiles.length, missing, mismatched };
}

async function main() {
  const [sourceDir, targetDir] = cliArgs();
  if (!sourceDir || !targetDir) {
    console.log(HELP);
    process.exit(1);
  }

  const { checked, missing, mismatched } = await checkAttachmentsContained(sourceDir, targetDir);

  if (missing.length === 0 && mismatched.length === 0) {
    console.log(`OK: all ${checked} file(s) in ${sourceDir} are present in ${targetDir}.`);
    return;
  }

  if (missing.length > 0) {
    console.log(`Missing from ${targetDir} (${missing.length}):`);
    for (const path of missing) console.log(`  ${path}`);
  }

  if (mismatched.length > 0) {
    console.log(`Same name but different content in ${targetDir} (${mismatched.length}):`);
    for (const path of mismatched) console.log(`  ${path}`);
  }

  console.log(`\n${checked - missing.length - mismatched.length}/${checked} file(s) confirmed contained.`);
  process.exit(1);
}

if (import.meta.main) main();
