# Remove the remaining 82 exact duplicate copies

**Later audit finding:** this pass achieved the duplicate count of seven but
did not restore all historical relationships. Nineteen pairs had become equal
only after earlier saved-entry URL overwrites. Review the
[07:25 chronological audit](./audit-2026-11-24/comparison-report.md) for the
affected identities and 42 parent relationships that differ from the 05:30 tree.

Use [deduplicate-after-recovery.js](./deduplicate-after-recovery.js), version
`2026-11-24.dedup.1`, **after the first recovery's `apply()`**. Keep the first
repair applied. This script installs a separate helper, `tktstoDedup`, and
preserves `tktstoRecovery` and its rollback snapshot.

The uploaded live diagnostic reproduces the reported **89** badge count after
the first pass: **82 extra exact-URL copies**, plus **7 matches among eight Moka
job pages**. Those eight job pages have distinct `#/job/...` routes. TKTSTO's
duplicate badge ignores fragments and counts copies beyond the first, so all
eight job records must remain to preserve the expected badge count of seven.

The first pass only processed its original live-tab mapping. This second pass
targets the 82 remaining pairs by specific node IDs, creation times, expected
window identities, and SHA-256 of their full URLs. It compares queries and
fragments exactly when deciding what to merge. The sidebar's looser URL
comparison is used only to report the resulting duplicate count.

For the uploaded diagnostic, running both passes in sequence gives:

| Measure | Before second pass | After second pass |
| --- | ---: | ---: |
| Duplicate badge | 89 | 7 |
| Tracked live Chrome tabs | 295 | 295 |
| Moka job records | 8 | 8 |
| Pink saved entries | 118 | 37 |
| Total tree entries | 1,034 | 952 |

The second pass removes 82 redundant tree records and reattaches 28 existing
Chrome tabs to retained saved records. It does not open, close, move, reload, or
navigate any browser tab. The separate app window also stays unchanged.

The oldest surviving original is retained where available. If the original
was deleted, a saved reconstruction in the live window is used. Where the only
saved reconstruction is in another saved window, the live entry is retained.
Notes, labels, tasks and children are preserved. Compatible donor annotations
are copied to the retained record; conflicting annotations stop that merge.
Window records are preserved, including a saved window that may become empty.

## Run

1. In macOS Terminal, copy the complete script:

   ```sh
   pbcopy < '/Users/revin/codex/tktsto-chromium/recovery/deduplicate-after-recovery.js'
   ```

2. Paste it into the **same TKTSTO service-worker DevTools Console** and press
   Enter. Pasting runs a read-only preview. It does not replace the first helper.
   If the service worker restarted, reopen it through `chrome://extensions`,
   run the following, right-click its output array, and select **Store as global
   variable** before pasting the script:

   ```js
   queryObjects((async () => {}).constructor)
   ```

3. Inspect the current preview:

   ```js
   tktstoDedup.stats
   console.table(tktstoDedup.matches)
   console.table(tktstoDedup.skipped)
   tktstoDedup.remainingDuplicates
   ```

   For the supplied state, expect `duplicateCountBefore: 89`,
   `duplicateCountAfter: 7`, `removedTreeEntries: 82`, and `canApply: true`.
   Current counts can differ if you have continued browsing. `apply()` refuses
   unless its plan leaves only the seven Moka matches among eight distinct URLs.
   It preserves newly added same-URL entries and refuses to close either of two
   live tabs. If the preview cannot reach the expected result, keep its report
   and export a current diagnostic instead of forcing it.

4. After a successful preview, run:

   ```js
   await tktstoDedup.apply()
   ```

   Avoid browser or tree edits while it runs. Close and reopen the TKTSTO sidebar
   afterward to refresh the badge.

## Snapshot and undo

The second pass saves its own pre-cleanup snapshot in the same IndexedDB
transaction as its edits. Failed transactions leave memory and stored nodes
unchanged. The first pass's snapshot is retained.

For immediate undo of **only the second pass**, in the same console and before
further browser or tree changes:

```js
await tktstoDedup.undo()
```

This returns to the state after the first repair. Undoing the first repair, if
desired, must come after undoing this second pass. Both helpers refuse to
overwrite a newer tree or browser state.

To download the second pass's pre-cleanup snapshot:

```js
await tktstoDedup.downloadBackup()
```

Backup imports are additive, so importing this file is not an undo operation.

## Verification

`test-second-pass.cjs` runs both scripts in sequence against the diagnostic's
actual in-memory graph, database records and Chrome IDs in an isolated extension
profile. It uses the sidebar's own URL parsing and clustering methods to check
the badge. Tests cover all surviving IDs and hierarchy, notes, transferred
children, unchanged Moka records and browser windows, snapshots, independent
undo, rollback after database writes begin, changing URLs, conflicting notes,
two live copies, new same-URL entries, ancestor relationships, and later browser
changes. Browser mutation APIs throw during these tests; none are called.

```sh
CHROME_PATH='/path/to/Chrome for Testing' node recovery/test-second-pass.cjs '/path/to/tktsto-live-diagnostic-1795473279069.json'
```

No URLs from the diagnostic are opened during testing.
