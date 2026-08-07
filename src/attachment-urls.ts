// attachment-urls.ts
//
// Shared logic for finding attachment URLs inside a Roam JSON export.
// Used by both list-attachments.ts and download-attachments.ts.

export interface RoamAttachment {
  url: string;
  // The markdown link's display text, e.g. "photo.png" from
  // "![photo.png](https://...)" — Roam's uploaded filenames are often
  // random storage IDs, so this is usually the only readable trace of
  // the original filename left in the export.
  label?: string;
}

// Markdown:
//   ![photo.png](https://firebasestorage.googleapis.com/...)
//   [report.pdf](https://firebasestorage.googleapis.com/...)
const markdownLinkRegex = /!?\[([^\]]*)]\((https?:\/\/[^)\s]+)\)/g;

// Raw URLs, useful for constructs such as:
//   {{pdf: https://firebasestorage.googleapis.com/...}}
// Excludes backticks so inline-code mentions like `https://...` don't glue
// the closing backtick (and whatever follows) onto the match.
const urlRegex = /https?:\/\/[^\s<>{}\[\]()"'`]+/g;

// Prose sometimes just *mentions* the storage host (e.g. inline-code
// asides like "served from `https://firebasestorage.googleapis.com`.")
// without linking to an actual file — trailing sentence punctuation glued
// onto a raw-URL match is a tell for that, so strip it before validating.
function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?]+$/, "");
}

// Roam uploads land on Firebase/Google Cloud Storage, but a bare mention
// of the host isn't a download link — real ones point at a specific
// object: "/v0/b/<bucket>/o/<path>?alt=media&token=..." for Firebase, or
// "/<bucket>/<object>" for a direct GCS URL. Checking the shape (not just
// a substring of the hostname) keeps prose mentions of the host itself
// from being mistaken for attachments.
function isRoamAttachmentUrl(url: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.hostname === "firebasestorage.googleapis.com") {
    return parsed.pathname.includes("/o/") && parsed.searchParams.get("alt") === "media";
  }

  if (parsed.hostname === "storage.googleapis.com") {
    return parsed.pathname.split("/").filter(Boolean).length >= 2;
  }

  return false;
}

function scanText(text: string, attachments: Map<string, string | undefined>): void {
  for (const match of text.matchAll(markdownLinkRegex)) {
    const [, label, url] = match;

    if (isRoamAttachmentUrl(url)) {
      const existingLabel = attachments.get(url);
      attachments.set(url, existingLabel || (label ? label.trim() : undefined) || undefined);
    }
  }

  for (const match of text.matchAll(urlRegex)) {
    const url = trimTrailingPunctuation(match[0]);

    if (isRoamAttachmentUrl(url) && !attachments.has(url)) {
      attachments.set(url, undefined);
    }
  }
}

function walk(value: unknown, attachments: Map<string, string | undefined>): void {
  if (typeof value === "string") {
    scanText(value, attachments);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) walk(item, attachments);
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      walk(child, attachments);
    }
  }
}

export function findAttachmentUrls(data: unknown): RoamAttachment[] {
  const attachments = new Map<string, string | undefined>();
  walk(data, attachments);

  return [...attachments.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([url, label]) => (label ? { url, label } : { url }));
}
