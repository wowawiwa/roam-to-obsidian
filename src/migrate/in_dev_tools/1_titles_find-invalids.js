// List page titles that aren't valid Obsidian filenames.

(function findInvalidTitles() {
  // System pages to explicitly skip
  const PROTECTED_TITLES = new Set([
    "roam/js",
    "roam/css",
    "roam/templates",
    "roam/render",
    "roam/depot"
  ]);

  const validObsidianTitle = /^(?!\.)(?!.*[:/\\|#^\[\]])(?!.*%%).+$/u;

  const allPages = roamAlphaAPI.q(`
    [:find ?uid ?title
     :where [?p :node/title ?title]
            [?p :block/uid ?uid]]
  `);

  const invalidTitles = [];

  for (const [uid, title] of allPages) {
    if (!title) continue;
    if (PROTECTED_TITLES.has(title.toLowerCase())) continue;
    if (validObsidianTitle.test(title)) continue;

    invalidTitles.push({ uid, title });
  }

  window.invalidTitles = invalidTitles;

  console.log(`%c[INVALID TITLES] ${invalidTitles.length} page titles don't match validObsidianTitle:`, "color: #00ffff; font-weight: bold;");
  for (const { title } of invalidTitles) {
    console.log(`  "${title}"`);
  }
  console.log("Type `copy(JSON.stringify(window.invalidTitles, null, 2))` to copy the list.");
})();
