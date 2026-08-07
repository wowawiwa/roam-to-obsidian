// Fix blocks where '{{[[TODO]]}}' or '{{[[DONE]]}}' isn't right at the
// start of the block (i.e. not right after the bullet).
//
// Two kinds of fix, applied in order:
//   1. Malformed markers with excess curly brackets (e.g.
//      "{{{[[DONE]]}}}}") are normalized to the canonical
//      "{{[[DONE]]}}", wherever they are in the block.
//   2. If the (now canonical) marker still isn't at the very start, it's
//      moved there, and the text that used to precede it is reattached
//      after it — smartly: joined with a single space, except when that
//      text is only a markdown wrapper opener (e.g. "**", "^^"), which
//      is glued directly to what follows so it doesn't break the
//      formatting.

(function setupMisplacedTodoFixer() {
  const MARKER_MALFORMED = /\{+\[\[(TODO|DONE)\]\]\}+/g;
  const MARKER_CANONICAL = /\{\{\[\[(TODO|DONE)\]\]\}\}/g;
  const WRAPPER_ONLY = /^(\*\*|__|~~|\^\^)$/;

  function normalizeBraces(string) {
    return string.replace(MARKER_MALFORMED, (_, kind) => `{{[[${kind}]]}}`);
  }

  function joinSegments(before, after) {
    if (!before) return after;
    if (!after) return before;
    if (WRAPPER_ONLY.test(before)) return before + after;
    return `${before} ${after}`;
  }

  function reposition(string) {
    MARKER_CANONICAL.lastIndex = 0;
    const match = MARKER_CANONICAL.exec(string);
    if (!match || match.index === 0) return string;

    const marker = match[0];
    const before = string.slice(0, match.index).trim();
    const after = string.slice(match.index + marker.length).trim();
    const rest = joinSegments(before, after);
    return rest ? `${marker} ${rest}` : marker;
  }

  function fixString(string) {
    return reposition(normalizeBraces(string));
  }

  let pendingFixes = [];

  window.fixMisplacedTodo = function ({ dry = true } = {}) {
    const allBlocks = roamAlphaAPI.q(`
      [:find ?uid ?string
       :where [?b :block/string ?string]
              [?b :block/uid ?uid]]
    `);

    pendingFixes = [];
    for (const [uid, string] of allBlocks) {
      if (!string) continue;
      const updated = fixString(string);
      if (updated !== string) pendingFixes.push({ uid, old: string, updated });
    }

    window.pendingTodoFixes = pendingFixes;

    if (dry) {
      console.log(`%c[DRY RUN] ${pendingFixes.length} blocks would be fixed:`, "color: #00ffff; font-weight: bold;");
      for (const { uid, old, updated } of pendingFixes) {
        console.log(`  [${uid}] "${old}" -> "${updated}"`);
      }
      console.log("Type `fixMisplacedTodo({ dry: false })` to apply these fixes.");
      return pendingFixes;
    }

    return window.executeMisplacedTodoFix();
  };

  window.executeMisplacedTodoFix = async function () {
    console.log(`Starting fixes for ${pendingFixes.length} blocks...`);
    let successCount = 0;

    for (const { uid, updated } of pendingFixes) {
      try {
        await roamAlphaAPI.updateBlock({ block: { uid, string: updated } });
        successCount++;
      } catch (err) {
        console.error(`Failed to update block ${uid}:`, err);
      }
    }

    console.log(`%c[DONE] Successfully fixed ${successCount}/${pendingFixes.length} blocks!`, "color: #00ff00; font-weight: bold;");
  };

  window.fixMisplacedTodo();
})();
