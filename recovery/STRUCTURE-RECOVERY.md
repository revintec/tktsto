# Restore the historical tree and Chrome tab order

Use [restore-order-and-structure.js](./restore-order-and-structure.js), version
`2026-11-24.structure.1`, with the first and second cleanup passes still applied.
It installs a separate `tktstoStructure` helper. Pasting the file only previews.

The historical reference is the original tree inside the **November 24, 05:30**
backup, excluding the four windows created by Chrome's crash restore. The script
matches pages by their **complete URLs**, including queries and fragments, and
keeps their current node IDs. This matters because some original IDs had their
URLs overwritten before the second cleanup.

## What changes

For the **07:25 backup**:

| Result | Count |
| --- | ---: |
| Existing records immediately before / after | 952 / 952 |
| Page URLs before / after | 930 / 930 |
| Live tabs before / after | 295 / 295 |
| Changed parent relationships | 42 |
| Changed child lists (membership and/or order) | 15 |
| Historical records matched | 950 |
| Historical records absent, left absent | 1 |
| Later records preserved | 2 |

The repair returns the Nobel video's 12 children to the current Nobel entry,
leaves the Lark document's two original children with that document, repairs the
other displaced branches, and returns three research links from the extra saved
window to their original locations. It also restores historical sibling order.
The preview lists every parent change and every changed child list.

Only `parent` and `nodes` change in TKTSTO. URLs, current node IDs, annotations,
creation times, live/saved/pink state, browser attachments, and navigation
metadata stay intact. Later entries keep their current parent and relative order;
they follow recovered historical children under that parent. Existing additional
same-URL entries stay separate when the verified original current entry is still
identifiable. The eight distinct Moka job URLs remain separate, so this repair
does not change the expected duplicate badge of seven.

The later Bilibili URL with the added slash remains. The missing **一元机场** ticket
page remains absent. The extra saved window becomes empty. TKTSTO's normal startup
cleanup deletes that empty unannotated window on a later extension reload; this
reduces the record count to **951** without removing any page.

Chrome tabs are reordered **within their existing windows** to follow the
recovered tree's traversal order. Pinned tabs retain their pinned state. The
script uses `chrome.tabs.move` and does not open, close, reload, navigate, pin,
unpin, or move tabs between windows. This reconstructs browser order from the
historical tree; the backups do not contain a separate pre-crash Chrome tab-bar
snapshot.

In the test using the recorded live diagnostic's Chrome ordering, all four
tracked windows needed ordering changes, requiring 166 individual moves. Your
live preview computes its own window and move counts. The separate app window is
preserved. The script stops if an affected window contains Chrome tab groups,
because moving grouped tabs needs a different approach to preserve those groups.

## Execute

1. Keep the earlier cleanup passes applied. Open `chrome://extensions`, enable
   **Developer mode**, and open TKTSTO's **service worker** → **Console**. Keep this
   DevTools window open during the operation.
2. If this worker console does not already have the stored array from the earlier
   setup, run:

   ```js
   queryObjects((async () => {}).constructor)
   ```

   Right-click the **array printed in the console** and select **Store as global
   variable**. Chrome names it `temp1`, `temp2`, etc.; the script detects the name.
   Do not chain `.find()` onto `queryObjects()`—its JavaScript return is undefined.
3. In macOS Terminal, copy the complete script:

   ```sh
   pbcopy < '/Users/revin/codex/tktsto-chromium/recovery/restore-order-and-structure.js'
   ```

   Paste it into the TKTSTO worker console and press Enter. Wait for the
   **PREVIEW ONLY** report and `Ready: await tktstoStructure.apply()`.
   Inspect details as needed:

   ```js
   tktstoStructure.stats
   console.table(tktstoStructure.parentChanges)
   tktstoStructure.childListChanges
   tktstoStructure.chromeChanges
   tktstoStructure.missing
   tktstoStructure.laterEntries
   ```

4. Save a portable copy of the current tree:

   ```js
   await tktstoStructure.downloadBackup()
   ```

   This downloads `tktsto-before-structure-<timestamp>.json`. The script also
   creates a separate internal rollback snapshot containing the original tree
   and Chrome order before making any changes.
5. Stop interacting with tabs and the tree while applying:

   ```js
   await tktstoStructure.apply()
   ```

   Wait for `applied: true`. Save the printed `backupKey`. If you opened, closed,
   moved, navigated, or edited something after preview, apply stops; refresh the
   preview with `await tktstoStructure.preview()` and review the new counts.
6. Close and reopen the **sidebar** to refresh it. Keep the extension and worker
   running while checking the result. Export a fresh normal backup after checking.

The helper is tied to this particular TKTSTO session. It refuses invalid live
IDs, ambiguous exact-URL matches, missing historical parents with surviving
children, changed window ownership, and incompatible pinned state. A missing
historical leaf is left absent. Do not remove these checks to force an apply;
export a new diagnostic if one fails.

## Undo or handle an interruption

To undo **this structure/order repair**, while the browser and tree still match
its applied state:

```js
await tktstoStructure.undo()
```

This restores both the immediately previous tree and Chrome order. It keeps the
earlier duplicate cleanups applied. Undo stops if there is newer browsing or tree
work, including startup removal of the empty saved window. Snapshots remain in
IndexedDB even when automatic undo is no longer applicable.

Chrome moves and IndexedDB cannot be one atomic transaction. The script saves a
rollback snapshot first, moves tabs with event suppression, verifies Chrome,
then commits the tree and completion record in one IndexedDB transaction. If a
move or database write fails, it attempts to restore the prior Chrome order.
If that compensation is incomplete, it reports the condition and exposes:

```js
tktstoStructure.pendingBrowserRollback
await tktstoStructure.retryBrowserRollback()
```

Retry requires the same tabs, URLs, windows, pinned state, and groups. It restores
order only; it will not recreate tabs that were closed after the failure.

If the helper was lost but the worker/browser identities and tree are still
compatible, repeat the console setup and script paste, then load its saved key:

```js
await tktstoStructure.resume('console-structure-apply-…')
```

Use the **complete actual key** printed by your run. The helper will indicate
whether `undo()` or `retryBrowserRollback()` is available. If preview fails after
an interruption, the helper is still installed and `resume()` can be attempted.
A full Chrome restart changes browser IDs, so automatic resume/undo is not
promised across that restart. Export a live diagnostic for that situation.

## Validation

The fixture test reconstructs live IDs by running the two previous cleanup
scripts against the uploaded diagnostic, then combines those IDs with the exact
07:25 backup. Its independent oracle checks parent relationships and sibling
order **by full URL against the 05:30 original tree**, rather than trusting the
new script's manifest. It also checks current page payloads, IDs, IndexedDB,
newer entries, ambiguous matches, and failure compensation.

A separate isolated Chrome test uses local `about:blank` pages with navigation
history and a pinned tab. It checks real tab moves, IDs, URLs, history, pin state,
move-event suppression, durable snapshot resume, undo, and database reload.
Neither test opens your backed-up web pages or modifies your actual browser.

Test sources:

- [test-structure-recovery.cjs](./test-structure-recovery.cjs)
- [test-structure-real-tabs.cjs](./test-structure-real-tabs.cjs)
- [structure-test-harness.cjs](./structure-test-harness.cjs)
