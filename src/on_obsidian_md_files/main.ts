#!/usr/bin/env node

import { existsSync } from "fs";
import { cp, mkdir, readdir, rm } from "fs/promises";
import { basename, dirname, join } from "path";
import { cliArgs } from "../cli-args.ts";
import { addRoamUid } from "./add-roam-uid.ts";
import { expandLineBreaks } from "./expand-line-breaks.ts";
import { extractInlineData } from "./extract-inline-data.ts";
import { fixAttachmentLinks } from "./fix-attachment-links.ts";
import { fixCodeblockEndings } from "./fix-codeblock-endings.ts";
import { fixPageLinks } from "./fix-page-links.ts";
import { fixRoamTables } from "./fix-roam-tables.ts";
import { copyContents, moveContents, moveEntry } from "./move-contents.ts";
import { normalizeLeadingTabs } from "./normalize-leading-tabs.ts";
import { replaceBulletAsterisks } from "./replace-bullet-asterisks.ts";

const DEFAULT_JSON_PATH = "migrations/export-processed.json";

function timestamp(): string {
  return new Date()
    .toISOString()
    .replace(/T/, "-")
    .replace(/:/g, "-")
    .replace(/\..+$/, "");
}

// Obsidian only localizes attachment links into "Attachments/imgs/app/<account>/"
// when "Download attachments" is checked at import time — verify that ran,
// so we're not silently left with unrewritten firebase links later.
async function resolveAccountName(inputDir: string): Promise<string> {
  const appDir = join(inputDir, "Attachments", "imgs", "app");
  if (!existsSync(appDir)) {
    throw new Error(`Expected ${appDir} to exist — re-import with "Download attachments" checked.`);
  }

  const entries = await readdir(appDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  if (dirs.length !== 1) {
    throw new Error(
      `Expected exactly one directory under ${appDir}, found ${dirs.length}: ${dirs.map((d) => d.name).join(", ") || "none"}`,
    );
  }

  return dirs[0].name;
}

const HELP = `main — run the Obsidian markdown normalization pipeline

Usage:
  main <directory> [roam-export.json]

Example:
  main ~/Obsidian/r/export-processed [roam-export.json]

<directory> is an Obsidian import done with "Download attachments"
checked, i.e. it has an "Attachments/imgs/app/<account>/" directory
alongside the .md files. Raises if that structure isn't there.

Defaults to "${DEFAULT_JSON_PATH}" for [roam-export.json] when not given.

Moves <directory> into a timestamped backup under migrations/ (left in
place afterwards, not cleaned up) and works on a copy of it: pulls the
attachments dir aside, runs the pipeline below on the rest, copies the
attachments back in flat, then moves the result up into the *parent* of
<directory> — since <directory> ends up one level flatter than it
started, links pointing at "<directory's name>/..." are fixed too.

Recursively processes all .md files, in order:
  1. add-roam-uid: tag each page's frontmatter with its Roam uid, using
     [roam-export.json].
  2. extract-inline-data: turn inline base64 "data:" image links into
     attachment files created alongside the .md file.
  3. normalize-leading-tabs: convert leading spaces to tabs, dedenting
     the file if every line then shares a common tab prefix.
  4. replace-bullet-asterisks: convert "*" list markers to "-".
  5. expand-line-breaks: expand the line-break placeholder into indented
     lines.
  6. fix-codeblock-endings: put codeblock closing fences on their own
     line.
  7. fix-roam-tables: convert Roam {{table}} blocks to Obsidian tables.
  8. fix-attachment-links: flatten links to the merged-in attachments.
  9. fix-page-links: drop <directory>'s own name out of links, since
     its content is moving up into its parent.
`;

async function main() {
  const [dir, jsonPath = DEFAULT_JSON_PATH] = cliArgs();
  if (!dir) {
    console.log(HELP);
    process.exit(1);
  }

  const accountName = await resolveAccountName(dir);

  const stagingDir = join("migrations", timestamp());
  await mkdir(stagingDir, { recursive: true });

  const backupDir = join(stagingDir, basename(dir));
  await moveEntry(dir, backupDir);

  const cpDir = join(stagingDir, "CP");
  await cp(backupDir, cpDir, { recursive: true });

  const finDir = join(stagingDir, "FIN");
  await mkdir(finDir, { recursive: true });

  const attachmentsDir = join(stagingDir, "Attachments");
  await moveEntry(join(cpDir, "Attachments"), attachmentsDir);

  await moveContents(cpDir, finDir);
  await rm(cpDir, { recursive: true, force: true });

  await addRoamUid(jsonPath, finDir);
  await extractInlineData(finDir);
  await normalizeLeadingTabs(finDir);
  await replaceBulletAsterisks(finDir);
  await expandLineBreaks(finDir);
  await fixCodeblockEndings(finDir);
  await fixRoamTables(finDir);
  await fixAttachmentLinks(finDir);
  await fixPageLinks(finDir, basename(dir));

  await copyContents(join(attachmentsDir, "imgs", "app", accountName), finDir);

  const targetDir = dirname(dir);
  await moveContents(finDir, targetDir);
  await rm(finDir, { recursive: true, force: true });
}

main();
