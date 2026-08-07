Tooling I developped for **migrating away from Roam Research to Obsidian**.

It **fills the (many) gaps left by the official Obsidian Roam-import plugin** (at least, all those I could identify), so you'll get the best possible Obsidian experience you can get from migrating from Roam, and I'd say it's good enough to move from Roam to Obsidian.

Migration guide below.

## Why migrating away?

- Lack of features:
  - Doesn't provide a **good API for external tools to interoperate** such as **AI agent**.
  - Doesn't provide a decent **mobile** app.
  - **Slow to load**.
- **Dying**, not evolving + small amount of users + on the cloud => **possibly insecure**, possibly locks you isolated.
- **Costs money** every month.

## Bridging the Roam–Obsidian gap

Obsidian isn't a drop-in replacement for Roam – there's no guarantee that everything you could do in Roam, you'll be able to do in Obsidian too (and what's possible often depends on which plugins you have installed).

That said, I've found that **Obsidian can be setup into a decent replacement**. You lose _queries_ and Roam's other block-specific features, but you keep a solid outliner-style editing experience otherwise.

**What this repo actually fixes is the migration** – the format conversion it requires.
Roam and Obsidian simply don't use the same underlying format.
The official Obsidian Roam-importer gets you partway there, but it leaves numerous gaps unresolved: gaps that _could_ be closed systematically, but aren't, leaving you with a complete mess out of the box.

As far as I know, these scripts close every one of those gaps. Concretely:
- **Titles**: every page title becomes a valid, safe Obsidian filename.
- **Roam-only syntax**: Roam-specific attribute and hashtag syntax turns into plain links Obsidian understands.
- **TODO/DONE markers**: TODO/DONE items stay recognized as actual checkboxes instead of getting buried mid-text.
- **Line breaks**: multi-line blocks are properly formatted.
- **Indentation**: nested outline levels stay intact instead of collapsing or drifting.
- **Bullet markers**: list markers match Obsidian's own convention.
- **Code blocks**: nested codeblocks display properly.
- **Tables**: Roam's outline-based tables become actual, readable Obsidian tables.
- **Attachments**: every attachment – inline or remote, also those missed by the Obsidian downloader – ends up stored locally and linked, so nothing still depends on Roam's storage.
- **Directory structure**: is simplified compared to the native export.
- **Roam UID**: each page keeps a stable reference back to its original Roam block.

They're not polished from a UX standpoint, but they're effective and quick to run. Don't hesitate to point your favorite coding agent at them if you want help making sense of them beyond these explanations.

## How to migrate

Some tools modify your Roam data. You can make it safe those ways:
- Roam provides EDN format backup that stores everything (except attachments of course) – just make an EDN export before starting.
- Roam allows restoring a graph at any point in time, so even without a backup you'd be safe. Simply write down the date and time before starting.

### 1. On the graph

Open Roam in your web browser, in your graph (any page), open the browser dev tools, and paste the scripts from `src/migrate/in_dev_tools`, in order.

Then perform your Roam backup in JSON, and put the file in `migrations/export.json`.

### 2. On the JSON export

Run `pnpm run migrate:json`.

Then import `migrations/export-processed.json` in Obsidian with those options:
- Download all attachments
- Add YAML created/updated at
- Add YAML title

### 3. On the Obsidian dir

Run `pnpm run migrate:md -- <directory>` on the **Obsidian directory** containing the md files, e.g. `pnpm run migrate:md -- ~/Obsidian/r`.

### Limitations

Zip files might not be properly imported by Obsidian. Make sure they work and replace them manually if not.

## Obsidian setup

Ask ChatGPT about plugins and config.

My plugins:
- **Bullet** (an **Outliner** fork) – To fill the gap between Obsidian native and Roam outlining management.
- **Outline Level Fold** – To fold at various indent level.
- **Zoom** – To allow zooming on a block
- **Backlink Settings** – To fold backlinks by default
