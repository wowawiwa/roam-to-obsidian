#!/usr/bin/env node

import { mkdir, readFile } from "fs/promises";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createInterface } from "node:readline/promises";
import { cliArgs } from "./cli-args.ts";
import { deriveFilenameFromUrl, findAttachmentUrls, type RoamAttachment } from "./attachment-urls.ts";

const CONCURRENCY = 5;
const DOWNLOAD_TIMEOUT_MS = 60_000;

const HELP = `download-attachments — download all attachments referenced in a Roam JSON export

Usage:
  download-attachments <roam-export.json>

Finds every attachment URL in the export, lists them, and asks for
confirmation. Once confirmed, downloads them all into
migrations/attachments-<timestamp>/. Attachments that fail to download
are reported at the end, with the reason for each failure.
`;

function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(/T/, "-")
    .replace(/:/g, "-")
    .replace(/\..+$/, "");
}

function deriveFilename({ url }: RoamAttachment, used: Set<string>): string {
  const name = deriveFilenameFromUrl(url);

  let candidate = name;
  let counter = 1;
  while (used.has(candidate)) {
    const dotIndex = name.lastIndexOf(".");
    candidate =
      dotIndex > 0
        ? `${name.slice(0, dotIndex)}-${counter}${name.slice(dotIndex)}`
        : `${name}-${counter}`;
    counter++;
  }

  used.add(candidate);
  return candidate;
}

async function downloadAttachment(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });

  if (!response.ok || !response.body) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  await pipeline(response.body, createWriteStream(destPath));
}

async function downloadAll(
  attachments: RoamAttachment[],
  dir: string,
): Promise<{ url: string; error: string }[]> {
  const failures: { url: string; error: string }[] = [];
  const used = new Set<string>();
  const queue = [...attachments];
  let completed = 0;

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const attachment = queue.shift();
      if (!attachment) break;

      const filename = deriveFilename(attachment, used);

      try {
        await downloadAttachment(attachment.url, join(dir, filename));
        completed++;
        console.log(`[${completed}/${attachments.length}] Downloaded ${filename}`);
      } catch (err) {
        completed++;
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ url: attachment.url, error: message });
        console.error(`[${completed}/${attachments.length}] FAILED ${attachment.url} (${message})`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, attachments.length) }, worker));

  return failures;
}

async function main() {
  const [filePath] = cliArgs();

  if (!filePath) {
    console.log(HELP);
    process.exit(1);
  }

  const data: unknown = JSON.parse(await readFile(filePath, "utf8"));
  const attachments = findAttachmentUrls(data);

  if (attachments.length === 0) {
    console.log("No Roam attachments found.");
    return;
  }

  console.log(`Found ${attachments.length} attachment(s):\n`);
  for (const { url, label } of attachments) {
    console.log(label ? `  ${label} — ${url}` : `  ${url}`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nDownload all ${attachments.length} attachment(s)? (y/N) `);
  rl.close();

  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log("Aborted.");
    return;
  }

  const dir = join("migrations", `attachments-${timestamp()}`);
  await mkdir(dir, { recursive: true });

  console.log(`\nDownloading into ${dir}...\n`);
  const failures = await downloadAll(attachments, dir);

  console.log(
    `\nDone: ${attachments.length - failures.length}/${attachments.length} downloaded to ${dir}.`,
  );

  if (failures.length > 0) {
    console.log(`\n${failures.length} attachment(s) failed to download:`);
    for (const { url, error } of failures) {
      console.log(`  ${url} — ${error}`);
    }
  }
}

if (import.meta.main) main();
