#!/usr/bin/env node

import { existsSync, createWriteStream } from "fs";
import { readFile, writeFile } from "fs/promises";
import { pipeline } from "node:stream/promises";
import { dirname, join } from "path";
import { cliArgs } from "../../common/cli-args.ts";
import { deriveFilenameFromUrl, isRoamAttachmentUrl, markdownLinkRegex } from "../../common/attachment-urls.ts";
import { findMarkdownFiles } from "./md-files.ts";

const DOWNLOAD_TIMEOUT_MS = 60_000;

const HELP = `download-remote-attachments — download attachments still linked
straight to Roam's storage, and embed them locally

Usage:
  download-remote-attachments <directory>

Recursively finds all .md files under <directory> and, for any link that
points at Roam's Firebase/Google Cloud Storage (e.g.
"[Video](https://firebasestorage.googleapis.com/...)" or
"![](https://storage.googleapis.com/...)"), downloads the file next to
the .md file — named after the last path segment of the URL, e.g.
"2h7bRzW-hY.jpg" — and replaces the link in place with a local embed,
e.g. "![[2h7bRzW-hY.jpg]]". A file that's already on disk under its
derived name is reused instead of re-downloaded, so it's safe to re-run.
`;

async function downloadTo(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  await pipeline(response.body, createWriteStream(destPath));
}

export interface DownloadFailure {
  file: string;
  url: string;
  error: string;
}

export async function downloadRemoteAttachments(dir: string): Promise<DownloadFailure[]> {
  const files = await findMarkdownFiles(dir);
  const failures: DownloadFailure[] = [];

  for (const file of files) {
    const original = await readFile(file, "utf8");
    const matches = [...original.matchAll(markdownLinkRegex)].filter(([, , url]) =>
      isRoamAttachmentUrl(url),
    );
    if (matches.length === 0) continue;

    const fileDir = dirname(file);
    let updated = "";
    let cursor = 0;
    let count = 0;

    for (const match of matches) {
      const [full, , url] = match;
      updated += original.slice(cursor, match.index);
      cursor = match.index + full.length;

      const name = deriveFilenameFromUrl(url);
      const destPath = join(fileDir, name);

      if (!existsSync(destPath)) {
        try {
          await downloadTo(url, destPath);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          failures.push({ file, url, error: message });
          updated += full;
          continue;
        }
      }

      updated += `![[${name}]]`;
      count++;
    }
    updated += original.slice(cursor);

    if (count > 0) {
      await writeFile(file, updated, "utf8");
      console.log(`Updated ${file} (downloaded ${count} attachment${count === 1 ? "" : "s"})`);
    }
  }

  return failures;
}

async function main() {
  const [dir] = cliArgs();
  if (!dir) {
    console.log(HELP);
    process.exit(1);
  }

  const failures = await downloadRemoteAttachments(dir);

  if (failures.length > 0) {
    console.log(`\n${failures.length} attachment(s) failed to download:`);
    for (const { file, url, error } of failures) {
      console.log(`  ${file}: ${url} — ${error}`);
    }
    process.exit(1);
  }
}

if (import.meta.main) main();
