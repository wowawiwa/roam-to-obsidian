Knowledge about Roam Research

## How to

### Restore at any point in time

You can restore your Roam graph as it was an any point in time, so there's no risk:

https://roamresearch.com/?historyDate=2026-07-31T14:21:59.700Z#/app/your-graph/

### Check the last 100 changes

```js
(function getNext100Changes() {
  const targetIso = "2026-07-31T13:07:21.941Z";
  const minTimeMs = Date.parse(targetIso);

  if (isNaN(minTimeMs)) {
    console.error("Invalid ISO timestamp format.");
    return;
  }

  // Datalog query to find blocks edited on or after minTimeMs
  const query = `[
    :find ?uid ?string ?editTime
    :in $ ?minTime
    :where
    [?e :block/uid ?uid]
    [?e :edit/time ?editTime]
    [(>= ?editTime ?minTime)]
    [?e :block/string ?string]
  ]`;

  const rawResults = window.roamAlphaAPI.q(query, minTimeMs);

  // Sort ascending by edit time and take the first 100
  const sortedChanges = rawResults
    .sort((a, b) => a[2] - b[2])
    .slice(0, 100)
    .map(([uid, string, editTime]) => ({
      uid,
      string,
      editedAt: new Date(editTime).toISOString(),
      timestampMs: editTime
    }));

  console.table(sortedChanges);
  return sortedChanges;
})();
```
