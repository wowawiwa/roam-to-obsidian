#!/usr/bin/env node

import { readFile, writeFile } from "fs/promises";
import { basename } from "path";
import { cliArgs } from "../cli-args.ts";
import { findMarkdownFiles, frontmatterLength } from "./md-files.ts";

interface RoamPage {
  title: string;
  uid: string;
}

function parseTitle(frontmatterLines: string[]): string | null {
  for (const line of frontmatterLines) {
    const match = line.match(/^title:\s*(.*)$/);
    if (!match) continue;
    let value = match[1].trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return null;
}

// This Obsidian import doesn't put a "title:" field in frontmatter at all —
// the page title is just the filename — so that's the fallback.
function titleFromFilename(file: string): string {
  return basename(file, ".md");
}

function hasCorrectRoamUid(frontmatterLines: string[], uid: string): boolean {
  return frontmatterLines.some((line) => {
    const match = line.match(/^roam-uid:\s*"?([^"]*)"?\s*$/);
    return match?.[1] === uid;
  });
}

// Roam daily notes have an English-ordinal title (e.g. "May 20th, 2019")
// but a uid that already encodes the date as MM-DD-YYYY (e.g.
// "05-20-2019") — while the Obsidian import renames them to an ISO
// filename/title (e.g. "2019-05-20"). Deriving the ISO date from the uid
// is far more robust than parsing ordinal English dates back out of it.
const DAILY_NOTE_UID = /^(\d{2})-(\d{2})-(\d{4})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface TitleIndex {
  byTitle: Map<string, string>;
  byIsoDate: Map<string, string>;
}

async function loadTitleIndex(jsonPath: string): Promise<TitleIndex> {
  const raw = await readFile(jsonPath, "utf8");
  const pages: unknown = JSON.parse(raw);
  if (!Array.isArray(pages)) {
    throw new Error(`Expected ${jsonPath} to contain a JSON array of pages`);
  }

  const byTitle = new Map<string, string>();
  const byIsoDate = new Map<string, string>();
  for (const page of pages as Partial<RoamPage>[]) {
    if (typeof page.title !== "string" || typeof page.uid !== "string") continue;

    byTitle.set(page.title, page.uid);

    const dailyMatch = page.uid.match(DAILY_NOTE_UID);
    if (dailyMatch) {
      const [, month, day, year] = dailyMatch;
      byIsoDate.set(`${year}-${month}-${day}`, page.uid);
    }
  }
  return { byTitle, byIsoDate };
}

interface Report {
  updated: string[];
  alreadyOk: string[];
  noFrontmatter: string[];
  noMatch: { file: string; title: string }[];
  errors: { file: string; error: string }[];
  fileByUid: Map<string, string[]>;
}

async function processFile(file: string, index: TitleIndex, report: Report): Promise<void> {
  const original = await readFile(file, "utf8");
  const hasTrailingNewline = original.endsWith("\n");
  const usesCRLF = original.includes("\r\n");
  const lines = original.split(/\r\n|\n/);
  if (hasTrailingNewline) lines.pop();

  const frontmatterEnd = frontmatterLength(lines);
  if (frontmatterEnd === 0) {
    report.noFrontmatter.push(file);
    return;
  }

  const frontmatterLines = lines.slice(0, frontmatterEnd); // includes both "---" delimiters
  const title = parseTitle(frontmatterLines) ?? titleFromFilename(file);

  const uid = index.byTitle.get(title) ?? (ISO_DATE.test(title) ? index.byIsoDate.get(title) : undefined);
  if (!uid) {
    report.noMatch.push({ file, title });
    return;
  }

  if (!report.fileByUid.has(uid)) report.fileByUid.set(uid, []);
  report.fileByUid.get(uid)!.push(file);

  if (hasCorrectRoamUid(frontmatterLines, uid)) {
    report.alreadyOk.push(file);
    return;
  }

  const withoutStaleUid = frontmatterLines.filter((line) => !/^roam-uid:\s*/.test(line));
  const newFrontmatter = [
    ...withoutStaleUid.slice(0, -1),
    `roam-uid: "${uid}"`,
    withoutStaleUid[withoutStaleUid.length - 1], // closing "---"
  ];

  const body = lines.slice(frontmatterEnd);
  const eol = usesCRLF ? "\r\n" : "\n";
  let updated = [...newFrontmatter, ...body].join(eol);
  if (hasTrailingNewline) updated += eol;

  await writeFile(file, updated, "utf8");
  report.updated.push(file);
}

const HELP = `add-roam-uid — tag each Obsidian page with its original Roam uid

Usage:
  add-roam-uid <roam-export.json> <obsidian-directory>

Matches each .md file under <obsidian-directory> to a page in the Roam
JSON export by title — the file's frontmatter "title:" value, falling
back to the filename when that field is absent — falling back further
to a daily note's ISO date (derived from its uid) when the title itself
is an ISO date, and adds a "roam-uid" field to its frontmatter with that
page's Roam uid. Already-correct files are left untouched. Reports (and
doesn't touch) files it couldn't process: no frontmatter, or no matching
Roam page — and warns if several files end up matching the same uid.
`;

export async function addRoamUid(jsonPath: string, dir: string): Promise<Report> {
  const index = await loadTitleIndex(jsonPath);

  const report: Report = {
    updated: [],
    alreadyOk: [],
    noFrontmatter: [],
    noMatch: [],
    errors: [],
    fileByUid: new Map(),
  };

  const files = await findMarkdownFiles(dir);
  for (const file of files) {
    try {
      await processFile(file, index, report);
    } catch (err) {
      report.errors.push({ file, error: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log(`Scanned ${files.length} files: ${index.byTitle.size} pages in ${jsonPath}.`);
  console.log(`  ${report.updated.length} updated, ${report.alreadyOk.length} already OK.`);

  if (report.noFrontmatter.length > 0) {
    console.log(`  ${report.noFrontmatter.length} skipped (no frontmatter, e.g. generated table embeds).`);
  }

  if (report.noMatch.length > 0) {
    console.warn(`  ${report.noMatch.length} files didn't match any Roam page by title:`);
    for (const { file, title } of report.noMatch) console.warn(`    ${file} (title: "${title}")`);
  }

  for (const [uid, matchedFiles] of report.fileByUid) {
    if (matchedFiles.length > 1) {
      console.warn(`  ${matchedFiles.length} files matched the same Roam uid "${uid}": ${matchedFiles.join(", ")}`);
    }
  }

  if (report.errors.length > 0) {
    console.warn(`  ${report.errors.length} files failed to process:`);
    for (const { file, error } of report.errors) console.warn(`    ${file}: ${error}`);
  }

  return report;
}

async function main() {
  const [jsonPath, dir] = cliArgs();
  if (!jsonPath || !dir) {
    console.log(HELP);
    process.exit(1);
  }

  await addRoamUid(jsonPath, dir);
}

if (import.meta.main) main();
