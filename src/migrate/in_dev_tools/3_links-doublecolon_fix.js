(function setupAttributeConverter() {
  const transformText = (text) => {
    // Skip Markdown headers
    if (/^\s*#{1,6}\s/.test(text)) return text;

    // Isolate protected regions: fenced code, inline code, URLs
    const protectedPattern = /(```[\s\S]*?```|`[^`\n]+`|https?:\/\/[^\s]+)/g;
    const parts = text.split(protectedPattern);

    return parts
      .map((part) => {
        if (
          part.startsWith("```") ||
          (part.startsWith("`") && part.endsWith("`")) ||
          part.startsWith("http://") ||
          part.startsWith("https://")
        ) {
          return part;
        }

        // Case A: ^(\s*)\[\[(.*?)\]\]:: -> $1[[$2]] (already bracketed key)
        let updated = part.replace(/^(\s*)\[\[(.*?)\]\]::/gm, "$1[[$2]]");

        // Case B: ^(\s*)(x):: -> $1[[x]]
        // Matches non-greedily from line start up to '::'
        // Allows any character (including Unicode, •, +, ?, etc.) and max one internal single ':'
        updated = updated.replace(/^(\s*)([^:\n]+(?::[^:\n]+)?)::/gm, (match, whitespace, key) => {
          const cleanKey = key.trim();
          if (!cleanKey) return match;
          return `${whitespace}[[${cleanKey}]]`;
        });

        return updated;
      })
      .join("");
  };

  // 1. Scan Graph
  const allBlocks = roamAlphaAPI.q(`
    [:find ?uid ?string
     :where [?b :block/uid ?uid]
            [?b :block/string ?string]]
  `);

  const pendingUpdates = [];
  for (const [uid, string] of allBlocks) {
    if (!string || !string.includes("::")) continue;
    if (string.trim().startsWith("```")) continue;

    const newString = transformText(string);
    if (newString !== string) {
      pendingUpdates.push({ uid, old: string, updated: newString });
    }
  }

  window.dryRunData = JSON.stringify(pendingUpdates, null, 2);

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // 2. Safe Execution with Backoff and Rate-Limiting
  window.executeAttributeConversion = async function () {
    console.log(`Starting execution for ${pendingUpdates.length} blocks...`);
    let successCount = 0;

    for (let i = 0; i < pendingUpdates.length; i++) {
      const { uid, updated } = pendingUpdates[i];
      let written = false;
      let retries = 0;

      while (!written && retries < 5) {
        try {
          await roamAlphaAPI.updateBlock({
            block: { uid, string: updated }
          });
          written = true;
          successCount++;
        } catch (err) {
          if (err.message && err.message.includes("rate limit exceeded")) {
            console.warn(`[Rate limit hit at item ${i + 1}] Pausing 10s before retry...`);
            await sleep(10000);
            retries++;
          } else {
            console.error(`Failed to update block ${uid}:`, err);
            break;
          }
        }
      }

      await sleep(65);

      if ((i + 1) % 50 === 0) {
        console.log(`Progress: ${i + 1}/${pendingUpdates.length} blocks processed...`);
      }
    }

    console.log(`%c[DONE] Successfully updated ${successCount}/${pendingUpdates.length} blocks!`, "color: #00ff00; font-weight: bold;");
  };

  console.log(`%c[DRY RUN COMPLETE] Found ${pendingUpdates.length} blocks matching starting attributes.`, "color: #00ffff; font-weight: bold;");
  console.log("1. Type `copy(window.dryRunData)` to copy the JSON list.");
  console.log("2. Type `executeAttributeConversion()` to execute updates safely.");
})();
