import { cp, readdir, rename, rm } from "fs/promises";
import { join } from "path";

// Cross-device (e.g. an external Obsidian vault vs. this repo's disk) moves
// fail with EXDEV under a plain rename, so fall back to copy-then-remove.
export async function moveEntry(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
    await cp(from, to, { recursive: true });
    await rm(from, { recursive: true, force: true });
  }
}

// Moves every entry directly inside `from` into `to` (which must already exist).
export async function moveContents(from: string, to: string): Promise<void> {
  const entries = await readdir(from);
  for (const entry of entries) {
    await moveEntry(join(from, entry), join(to, entry));
  }
}

// Copies every entry directly inside `from` into `to` (which must already exist).
export async function copyContents(from: string, to: string): Promise<void> {
  const entries = await readdir(from);
  for (const entry of entries) {
    await cp(join(from, entry), join(to, entry), { recursive: true });
  }
}
