# Reconnect the November 24 restored tabs

**Restore historical structure after both cleanup passes:** use the new
[structure and Chrome-order recovery](./STRUCTURE-RECOVERY.md). It restores the
original branches and sibling order by full URL while keeping current page
records, then reorders existing Chrome tabs to match the recovered tree.

**07:25 backup audit:** the duplicate count reached seven, but earlier URL
overwrites affected historical tree identity. The second pass merged 19 pairs
that represented different pages at 05:30, and 42 current parent relationships
differ from the original tree. See the [chronological comparison](./audit-2026-11-24/comparison-report.md)
before treating these scripts as a complete restoration of the pre-crash tree.

**Already applied this script and still see 89 duplicates?** Keep that first
repair applied and use the separate [second-pass cleanup](./SECOND-PASS.md).
It removes the remaining 82 exact-URL copies while preserving all eight distinct
Moka job pages, leaving the expected duplicate badge of seven. Do not rerun or
replace the first helper for that step.

Use **[reconnect-restored-tabs-latest.js](./reconnect-restored-tabs-latest.js)**,
version **2026-11-24.4**. The earlier script is retained as a reference.

The live diagnostic exported at **06:34:39** identifies the cause of the reported
validation error: entry `1m854zfyy--mac` is marked `loaded: true` with
`tabId: null`, in both memory and the database. Chrome has no tab with that URL.
All **295 tabs in four regular windows** already have verified identities.
The 296th Chrome tab belongs to a separate app window, which is unaffected.

Version .4 preserves that specific stale entry as a **grey saved link**, clears
its broken browser attachment, and continues the cleanup. It keeps the original
pink entry too. Neither saved link is reopened or deleted. This exception only
applies if the current live evidence still agrees: the diagnosed entry is still
null-ID, its original has the same URL, no Chrome tab has that committed or
pending URL, and every regular-window tab has a verified owner. Other unmatched
invalid IDs still stop the repair. Inspect `tktstoRecovery.savedEntries` to see
the proposed correction.

For this diagnostic, the preview reconnects **263 tabs**, removes **267 redundant
tree entries**, retains **295 tracked live tabs**, and leaves **118 pink entries**
and **1,034 total tree entries**. It skips 33 manifest pairs: 16 missing original
entries, 16 changed URLs, and the one stale entry. Current counts can differ if
you have continued browsing.

The diagnostic says your loaded console helper was version .2. The reported
failure occurred during preview before any repair. Replace that helper by
pasting the entire latest file; do not run the old `.apply()` first. If a helper
already has a rollback snapshot, the script refuses to replace it.

For an error such as `Invalid or repeated browser ID`, first export a live
diagnostic with **[export-live-diagnostic.js](./export-live-diagnostic.js)**.
Paste that entire file into the same service-worker Console. It only reads data
and downloads `tktsto-live-diagnostic-….json`; it does not repair or change the
tree. It uses the same `queryObjects` / “Store as global variable” setup below.
Unlike normal backups, the diagnostic retains tab/window IDs and includes the
in-memory tree, stored database records, and Chrome's actual windows/tabs.

This is the first cleanup pass discussed in the chat. It reconnects eligible
restored live tabs to their original saved entries, preserving their current
tree positions, labels, notes, saved children, and creation times. Existing
Chrome pages and their history remain in the same tabs. It does not reconstruct
original entries that were deleted or overwrite entries whose URLs changed.

The uploaded backups produce these results:

| Backup on November 24 | Reconnected tabs | Skipped pairs | Remaining pink entries | Tree entries after repair |
| --- | ---: | ---: | ---: | ---: |
| 05:30:26 | 296 | 0 | 35 | 951 |
| 05:57:12 | 264 | 32 | 117 | 1,033 |
| 06:24:49 | 264 | 32 | 117 | 1,035 |
| 06:34:39 live diagnostic | 263 | 33 | 118 | 1,034 |

The first two retain all 296 live tabs recorded in those backups. At 05:57,
16 original target entries are missing and 16 have different URLs. Their
restored live entries are preserved. The extra pink entries remain saved for
separate review.

The 06:24 backup records 298 live entries, including two additions. A normal
backup cannot reproduce its live-ID error because export removes those IDs.
The matching-count test for that backup therefore uses simulated valid IDs;
separate tests inject missing and duplicate identities. Actual repair eligibility
depends on the current Chrome data reported by the live diagnostic.

Version 2026-11-24.4 can also correct a missing, non-numeric, nonexistent, or duplicated
tab ID only when Chrome provides one unambiguous, unclaimed exact URL match in
the same verified window, with matching pinned and incognito state. It preserves
existing verified owners first. It never guesses among repeated identical tabs,
matches across windows, or infers a tab ID from a page title. Proposed repairs
appear in `tktstoRecovery.identityRepairs` and are applied only with `apply()`.

**Your current counts may differ because you have opened and closed tabs since
then.** The script reads the current tree and Chrome tabs each time you preview
or apply. New tabs are preserved even when their URLs match an old duplicate;
closed tabs stay closed. The script uses specific entry IDs from the original
backup and requires an exact current URL match, including queries and fragments.

## Run it

1. Open `chrome://extensions`, enable **Developer mode**, find TKTSTO, and click
   its **service worker** link under “Inspect views.” Select **Console** in the
   DevTools window. Keep this window open throughout the repair.
2. Run this setup command:

   ```js
   queryObjects((async () => {}).constructor)
   ```

   Right-click the resulting **array** and choose **Store as global variable**.
   Chrome will name it something like `temp1`. The script detects that name
   automatically. This exposes the existing background instance to the script;
   it does not change your tree. The extra step is necessary because TKTSTO does
   not expose its background instance as a global variable, and Chrome service
   workers do not support dynamic `import()`.
3. Copy **the entire contents** of `reconnect-restored-tabs-latest.js` and paste it
   into the same console. This only produces a preview. The console prints
   version `2026-11-24.4`, the eligible matches, and the number of current live
   tabs retained. Use the current preview rather than an earlier backup's count.
   Inspect the report with:

   ```js
   tktstoRecovery.stats
   console.table(tktstoRecovery.matches)
   console.table(tktstoRecovery.skipped)
   console.table(tktstoRecovery.identityRepairs)
   console.table(tktstoRecovery.savedEntries)
   ```

   If you continued browsing after the preview, refresh it with
   `await tktstoRecovery.preview()`.

4. When the preview completes successfully, apply the repair:

   ```js
   await tktstoRecovery.apply()
   ```

   Avoid editing the tree or opening/closing/moving tabs while this runs. The
   script rechecks the live browser state and saves a rollback snapshot together
   with the repair in one IndexedDB transaction. It does not open, close, move,
   reload, or navigate Chrome tabs. Existing navigation history and page state
   remain in their existing tabs.
5. Close and reopen the TKTSTO sidebar to refresh it.

If the script reports an error, stop at that error. For example, closing an
entire restored window or reopening an original saved window can make the old
window mapping unsuitable. The script stops before applying that plan.

If you already applied a repair, keep its console helper and snapshot. Do not
replace it with another pasted script or run apply again. This version refuses
to replace an existing helper that has a rollback snapshot.

If entries changed since the uploaded backup, the preview can show fewer
matches. Exact URLs include query strings and fragments. Conflicting notes,
changed URLs, bookmarks, and unmatched entries are preserved for review. Unique
children of a removed duplicate are attached to the corresponding original.

## Backup and undo

An automatic snapshot is stored in TKTSTO's `Snapshots` IndexedDB store. Its key
is printed after applying and is also available as `tktstoRecovery.backupKey`.
To download the pre-repair snapshot as a normal TKTSTO backup:

```js
await tktstoRecovery.downloadBackup()
```

This starts a JSON download. Before applying, the same command downloads the
current tree instead. TKTSTO backup imports are additive; do not import this
file over the current tree as an undo operation.

For immediate undo in the same worker console:

```js
await tktstoRecovery.undo()
```

Undo refuses if the tree or browser tab identities/URLs have changed, to avoid
overwriting newer work. The snapshot remains stored even if automatic undo is
refused. The console helper itself lasts only as long as this service worker.

If live identities needed correction, undo restores the pre-cleanup organization
while keeping verified IDs and the diagnosed stale entry saved. It does not
recreate invalid IDs or the stale loaded flag.
The internal snapshot still retains the raw pre-repair records for diagnosis.

The updated helper also provides these read-only diagnostic commands:

```js
await tktstoRecovery.diagnose()
await tktstoRecovery.downloadDiagnostics()
```

For an older helper that lacks these commands, use `export-live-diagnostic.js`.

## Verification

All three supplied backups were tested using their original graphs and simulated live
Chrome IDs, with real IndexedDB transactions in isolated extension profiles.
Checks covered attachment/deletion counts, original metadata and hierarchy,
remaining pink entries, immediate undo, new descendants, conflicting notes,
strict URL matching, changed browser state, and an injected database failure.
A failed write left both memory and the database unchanged. Additional cases
cover new tabs with matching and unrelated URLs, closed tabs with and without
saved annotations, and refusal after a whole restored window closes.

Identity tests cover missing, string, nonexistent and duplicated tab IDs, stale
tab window IDs, and refusal when several entries or browser tabs could match.
The read-only diagnostic exporter is checked separately for preserving IDs,
runtime types and stored records without modifying the tree or browser tabs.

The live diagnostic test uses its exact in-memory graph, database records and
Chrome tab IDs, including the null ID and the app window. It checks read-only
preview, the saved-link correction, attachment counts, preserved metadata,
the raw rollback snapshot, immediate undo, and atomic database failure. The
exception is refused for altered identities, pending closes, an exact URL in
an app window, an unclaimed regular-window tab, or another unmatched null ID.
If the missing page has one newly reopened exact match, that current tab is
reattached instead of using the diagnostic's old absence.

A separate integration test used real, local `about:blank` tabs in an isolated
Chrome profile. Apply and undo preserved tab IDs, URLs, window IDs, tab order,
and navigation history. Reloading the database and running normal session
reconciliation preserved the repaired tree without recreating duplicates.
No URLs from the uploaded backup were opened during testing.

With Playwright available to Node, run:

```sh
CHROME_PATH='/path/to/Chrome for Testing' node recovery/test-reconnect-restored-tabs.cjs '/path/to/tktsto.2026-11-24_05-30-26.mac.json'
CHROME_PATH='/path/to/Chrome for Testing' node recovery/test-latest-backup.cjs '/path/to/tktsto.2026-11-24_05-57-12.mac.json'
CHROME_PATH='/path/to/Chrome for Testing' node recovery/test-latest-backup.cjs '/path/to/tktsto.2026-11-24_06-24-49.mac.json'
CHROME_PATH='/path/to/Chrome for Testing' node recovery/test-id-recovery.cjs '/path/to/tktsto.2026-11-24_05-30-26.mac.json'
CHROME_PATH='/path/to/Chrome for Testing' node recovery/test-live-diagnostic.cjs '/path/to/tktsto-live-diagnostic-1795473279069.json'
CHROME_PATH='/path/to/Chrome for Testing' node recovery/test-real-tabs.cjs
```

These tests create separate temporary Chrome profiles.
