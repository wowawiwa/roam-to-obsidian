// Rewrite page titles by applying a list of string replacements, e.g. to
// get rid of characters Obsidian treats specially in filenames (/, \, |).

(function setupTitleConverter() {
  // System pages to explicitly skip
  const PROTECTED_TITLES = new Set([
    "roam/js",
    "roam/css",
    "roam/templates",
    "roam/render",
    "roam/depot",
    "roam/comments",
  ]);

  const DEFAULT_TRANSFORMS = {
    "#": "#️⃣",
    ": ": " - ", // or ".. "
    " / ": ", ",
    "/": ", ",
    " \\ ": ", ",
    "\\": ", ",
    " | ": ", ",
    "|": ", "
  };

  function applyTransforms(title, transforms) {
    let result = title;
    for (const [from, to] of Object.entries(transforms)) {
      result = result.replaceAll(from, to);
    }
    return result;
  }

  // Helper delay function
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let pendingUpdates = [];

  window.convertTitles = function (transforms = DEFAULT_TRANSFORMS, { dry = true } = {}) {
    // 1. Scan Graph for Pages
    const allPages = roamAlphaAPI.q(`
      [:find ?uid ?title
       :where [?p :node/title ?title]
              [?p :block/uid ?uid]]
    `);

    pendingUpdates = [];
    const updateByUid = new Map();

    for (const [uid, title] of allPages) {
      if (!title) continue;
      if (PROTECTED_TITLES.has(title.toLowerCase())) continue;

      const newTitle = applyTransforms(title, transforms);
      if (newTitle === title) continue;

      const update = { uid, old: title, updated: newTitle };
      pendingUpdates.push(update);
      updateByUid.set(uid, update);
    }

    // 2. Save Dry Run Data Globally
    window.dryRunData = JSON.stringify(pendingUpdates, null, 2);

    // 3. Find collisions: pages that would end up sharing the same final title
    // (whether both are renamed into it, or one is renamed into a title an
    // untouched page already has).
    const finalTitleOwners = new Map();
    for (const [uid, title] of allPages) {
      if (PROTECTED_TITLES.has(title.toLowerCase())) continue;
      const update = updateByUid.get(uid);
      const finalTitle = update ? update.updated : title;
      if (!finalTitleOwners.has(finalTitle)) finalTitleOwners.set(finalTitle, []);
      finalTitleOwners.get(finalTitle).push(update ? `${title}" -> "${finalTitle}` : title);
    }

    if (dry) {
      console.log(`%c[DRY RUN] ${pendingUpdates.length} page titles would be renamed:`, "color: #00ffff; font-weight: bold;");
      for (const { old, updated } of pendingUpdates) {
        console.log(`  "${old}" -> "${updated}"`);
      }

      for (const [finalTitle, owners] of finalTitleOwners) {
        if (owners.length > 1) {
          console.warn(`[COLLISION] ${owners.length} pages would end up named "${finalTitle}": "${owners.join('", "')}"`);
        }
      }

      console.log("1. Type `copy(window.dryRunData)` to copy the JSON list.");
      console.log("2. Type `executeTitleConversion()` to execute the title updates safely.");
      return pendingUpdates;
    }

    return window.executeTitleConversion();
  };

  // Safe Execution with Backoff and Rate-Limiting
  window.executeTitleConversion = async function () {
    console.log(`Starting title updates for ${pendingUpdates.length} pages...`);
    let successCount = 0;

    for (let i = 0; i < pendingUpdates.length; i++) {
      const { uid, updated } = pendingUpdates[i];
      let written = false;
      let retries = 0;

      while (!written && retries < 5) {
        try {
          await roamAlphaAPI.updatePage({
            page: { uid, title: updated }
          });
          written = true;
          successCount++;
        } catch (err) {
          if (err.message && err.message.includes("rate limit exceeded")) {
            console.warn(`[Rate limit hit at item ${i + 1}] Pausing 10s before retry...`);
            await sleep(10000);
            retries++;
          } else {
            console.error(`Failed to update page ${uid} ("${updated}"):`, err);
            break;
          }
        }
      }

      // Base pacing delay (~15 req/sec max to stay under 1,500/min cap)
      await sleep(65);

      if ((i + 1) % 25 === 0) {
        console.log(`Progress: ${i + 1}/${pendingUpdates.length} pages processed...`);
      }
    }

    console.log(`%c[DONE] Successfully updated ${successCount}/${pendingUpdates.length} page titles!`, "color: #00ff00; font-weight: bold;");
  };

  window.convertTitles();
})();
