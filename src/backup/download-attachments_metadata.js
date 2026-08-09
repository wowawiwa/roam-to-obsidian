/*
 * ROAM RESEARCH ATTACHMENT METADATA EXPORTER
 *
 * HOW TO USE
 * ==========
 *
 * 1. Open your graph in Roam Research using Chrome.
 *
 * 2. In Roam, open:
 *
 *      ⋯ → Settings → Attachments
 *
 * 3. Wait until the attachment cards appear.
 *
 * 4. Open Chrome DevTools:
 *
 *      macOS:   Command + Option + I
 *      Windows: Control + Shift + I
 *      Linux:   Control + Shift + I
 *
 * 5. Select the "Console" tab in DevTools.
 *
 * 6. Copy this entire script, paste it into the Console, and press Enter.
 *
 *    Chrome may display a warning that prevents pasting. If it instructs you
 *    to type "allow pasting", type those words manually and then paste the
 *    script again.
 *
 * 7. Keep the Roam tab open while the script runs. The script will:
 *
 *    - click "Show More" until every attachment is visible;
 *    - collect the original filename and Firebase Storage URL;
 *    - request the complete Firebase Storage metadata for every attachment;
 *    - download a detailed JSON export;
 *    - download a CSV summary.
 *
 * 8. Watch the Console for progress. When finished, it will print:
 *
 *      Export complete
 *
 * IMPORTANT PRIVACY NOTE
 * ======================
 *
 * The exported files contain Firebase download URLs and access tokens that
 * may allow someone to download your attachments. Treat the JSON and CSV
 * exports as sensitive information. Do not commit them to a public GitHub
 * repository or share them unless you understand the consequences.
 *
 * This is an unofficial tool. It relies on Roam's current Attachments UI and
 * may need updating if Roam changes its internal HTML structure.
 */

(async () => {
  const CARD_SELECTOR = ".rm-file-card";
  const FIREBASE_LINK_SELECTOR =
    'a[href*="firebasestorage.googleapis.com"]';

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const download = (filename, contents, type) => {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const csvEscape = value => {
    const text = value == null ? "" : String(value);

    return /[",\n]/.test(text)
      ? `"${text.replaceAll('"', '""')}"`
      : text;
  };

  const findShowMore = () =>
    [...document.querySelectorAll("button, .bp3-button")]
      .find(element => element.textContent.trim() === "Show More");

  const waitForExpansion = async previousCount => {
    const deadline = Date.now() + 5000;

    while (Date.now() < deadline) {
      const currentCount =
        document.querySelectorAll(CARD_SELECTOR).length;

      if (currentCount > previousCount || !findShowMore()) {
        return currentCount;
      }

      await sleep(100);
    }

    return document.querySelectorAll(CARD_SELECTOR).length;
  };

  console.log("Expanding the complete attachment list…");

  for (let attempt = 0; attempt < 100; attempt++) {
    const showMore = findShowMore();

    if (!showMore) {
      break;
    }

    const previousCount =
      document.querySelectorAll(CARD_SELECTOR).length;

    showMore.click();
    await waitForExpansion(previousCount);
  }

  const cards = [...document.querySelectorAll(CARD_SELECTOR)];

  if (!cards.length) {
    throw new Error(
      "No attachments found. Open Roam → Settings → Attachments first."
    );
  }

  console.log(`Found ${cards.length} attachments.`);

  const attachments = cards.map((card, index) => {
    const link = card.querySelector(FIREBASE_LINK_SELECTOR);

    const lines = card.innerText
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);

    if (!link) {
      return {
        index,
        originalFilename: lines[0] || null,
        displayedSize: lines[1] || null,
        downloadUrl: null,
        error: "Firebase Storage link not found"
      };
    }

    const downloadUrl = link.href;
    const parsedUrl = new URL(downloadUrl);
    const encodedPath = parsedUrl.pathname.split("/o/")[1] || "";
    const storagePath = decodeURIComponent(encodedPath);

    return {
      index,
      originalFilename: lines[0] || null,
      displayedSize: lines[1] || null,
      downloadUrl,
      downloadToken: parsedUrl.searchParams.get("token"),
      storagePath,
      storageObjectName: storagePath.split("/").pop()
    };
  });

  const fetchMetadata = async attachment => {
    if (!attachment.downloadUrl) {
      return attachment;
    }

    try {
      /*
       * Removing `alt=media` changes the request from downloading the object
       * to retrieving its Firebase Storage metadata document.
       */
      const metadataUrl = new URL(attachment.downloadUrl);
      metadataUrl.searchParams.delete("alt");

      const response = await fetch(metadataUrl);

      if (!response.ok) {
        throw new Error(
          `Metadata request returned HTTP ${response.status}`
        );
      }

      const storageMetadata = await response.json();

      return {
        ...attachment,

        /*
         * Prefer Firebase's custom original-filename metadata when it is
         * available.
         */
        originalFilename:
          storageMetadata.metadata?.["file-name"] ||
          attachment.originalFilename,

        storagePath:
          storageMetadata.name || attachment.storagePath,

        storageObjectName:
          (storageMetadata.name || attachment.storagePath)
            ?.split("/")
            .pop() || null,

        sizeBytes:
          storageMetadata.size == null
            ? null
            : Number(storageMetadata.size),

        contentType: storageMetadata.contentType || null,
        timeCreated: storageMetadata.timeCreated || null,
        updated: storageMetadata.updated || null,
        md5Hash: storageMetadata.md5Hash || null,
        crc32c: storageMetadata.crc32c || null,
        generation: storageMetadata.generation || null,
        metageneration: storageMetadata.metageneration || null,
        customMetadata: storageMetadata.metadata || null,

        /*
         * Preserve every field returned by Firebase in addition to the
         * convenient flattened fields above.
         */
        storageMetadata
      };
    } catch (error) {
      return {
        ...attachment,
        metadataError: String(error)
      };
    }
  };

  /*
   * Limit concurrency instead of sending hundreds of metadata requests at
   * exactly the same time.
   */
  const results = new Array(attachments.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const index = nextIndex++;

      if (index >= attachments.length) {
        return;
      }

      results[index] = await fetchMetadata(attachments[index]);

      if ((index + 1) % 25 === 0) {
        console.log(
          `Fetched metadata for ${index + 1}/${attachments.length}`
        );
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(12, attachments.length) },
      worker
    )
  );

  const failures = results.filter(
    attachment =>
      attachment.metadataError ||
      attachment.error
  );

  const graphName =
    location.hash.match(/#\/app\/([^/]+)/)?.[1] || null;

  const exportData = {
    format: "roam-attachment-metadata-export",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    graphName,
    attachmentCount: results.length,
    metadataFailureCount: failures.length,
    attachments: results
  };

  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");

  const basename =
    `roam-attachments-${graphName || "graph"}-${timestamp}`;

  download(
    `${basename}.json`,
    JSON.stringify(exportData, null, 2) + "\n",
    "application/json"
  );

  const csvColumns = [
    "originalFilename",
    "storagePath",
    "storageObjectName",
    "sizeBytes",
    "contentType",
    "timeCreated",
    "updated",
    "md5Hash",
    "crc32c",
    "generation",
    "metageneration",
    "downloadUrl",
    "metadataError"
  ];

  const csv = [
    csvColumns.join(","),

    ...results.map(attachment =>
      csvColumns
        .map(column => csvEscape(attachment[column]))
        .join(",")
    )
  ].join("\n") + "\n";

  download(
    `${basename}.csv`,
    csv,
    "text/csv;charset=utf-8"
  );

  console.log({
    message: "Export complete",
    attachments: results.length,
    metadataFailures: failures.length
  });

  return exportData;
})();
