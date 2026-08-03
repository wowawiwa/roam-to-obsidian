Tooling I developped for migrating away from Roam Research to Obsidian. It fills the gaps left by the official Obsidian Roam-import plugin (and there are many gaps to solve).

It solves all gaps I could identify and that can be solved systematically – so you'll get the best possible Obsidian experience you can get from migrating from Roam, and I'd say it's good enough to move from Roam to Obsidian.

Migration guide below.

## Bridging the Roam–Obsidian gap

Obsidian isn't the same as Roam – it's not guaranteed that everything you could do with Roam, you'll be able to do with Obsidian (and anyway, this depends on available plugins). But Obsidian can be setup to be a decent replacement. The result? You'll lose _queries_ and other block-specific Roam features, but you get a solid Roam experience other than that: An operational outliner-style editor.

But there are **plenty of small format gaps** between Roam and Obsidian: Things that _can_ be resolved systematically, but **the official Obsidian importer doesn't do it**, and out-of-the-box result is a complete mess.

**This tooling fixes those gaps**.
To my knowledge, it tackles all those that can be tackled.
Concretely, it's doing things like sanitizing titles to be Obsidian-compatible, re-indenting properly, converting TODO/DONE format, fixing nested tables, multi-line blocks ... this kind of things.

Those scripts are not polished in terms of UX, but they are effective and it doesn't take long to run. Don't hesitate to use your favorite coding agent to help making sense of them beyond those explanations.

## How to migrate

Some tools modify your Roam data. You can make it safe those ways:
- Roam provides EDN format backup that stores everything (except attachments of course) – just make an EDN export before starting.
- Roam allows restoring a graph at any point in time, so even without a backup you'd be safe. Simply write down the date and time before starting.

### 1. On the graph

Run the scripts in `in_dev_tools`: Open Roam in your web browser in your graph (any page), open the browser dev tools and copy paste the scripts:
- Start with `titles_find-invalids` to find invalid titles
- Then configure `titles_fix` variable `DEFAULT_TRANSFORMS` to fix them
- Then apply the other scripts once

Then perform your Roam backup in JSON, and put the file in `migrations/export.json`.

### 2. On the JSON export

Run `pnpm run roam-json-export-processing`.

Then import `migrations/export-processed.json` in Obsidian with those options:
- Download all attachments
- Add YAML created/updated at
- Add YAML title

### 3. On the Obsidian dir

Run `pnpm run on_obsidian_md_files` on the **Obsidian directory** containing the md files, e.g. `~/Obsidian/r`.

## Obsidian setup

Ask ChatGPT about plugins and config. Some:
- **Outliner** – To fill the gap between Obsidian native and Roam outlining management.
- **Outline Level Fold** – To fold at various indent level.
- **Zoom**
...

### Why migrating away?

- Lack of features:
  - Doesn't provide a **good API for external tools to interoperate** such as **AI agent**.
  - Doesn't provide a decent **mobile** app.
  - **Slow to load**.
- **Dying**, not evolving + small amount of users + on the cloud => **possibly insecure**, possibly locks you isolated.
- **Costs money** every month.
