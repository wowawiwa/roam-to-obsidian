// list-roam-attachments.ts
//
// Usage:
//   node src/list-attachments.ts roam-export.json

import fs from "node:fs";
import { findAttachmentUrls } from "./attachment-urls.ts";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node src/list-attachments.ts <roam-export.json>");
  process.exit(1);
}

const data: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
const attachments = findAttachmentUrls(data);

for (const { url } of attachments) {
  console.log(url);
}

console.error(`\n${attachments.length} unique attachment(s) found.`);
