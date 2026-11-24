# Tab storage and data-loss audit — 24 November 2026

The current implementation has useful protection against interrupted structural writes, but it should not be the only copy of important saved tabs. The most consequential remaining issues are unsafe startup URL matching, failed writes leaving memory different from disk, and incomplete handling of damaged records and imports.

Scope: source in `/Users/revin/codex/tktsto-chromium`, manifest version `0.1.181.0` including the local Unreleased changes. This folder has no Git metadata, so no upstream revision is implied. I inspected the profile registration and storage-directory existence, ran four existing regression suites, and reproduced nine observations in disposable Chromium databases. I did not change application code, the user's Chrome profile, tabs, or backups. This is not a live database integrity check, and the currently configured automatic-backup interval was not verified.

**Where the data lives**

| Data | Storage | Lifetime and coverage |
|---|---|---|
| Saved tree and tab records | Extension-origin IndexedDB, database `TKTSTO`, schema version 1, object store `Nodes` | Persistent across normal browser and worker restarts. One record per node. |
| Notes, labels, URLs, titles, hierarchy and history | Fields inside each `Nodes` record | The parent ID and ordered child-ID list encode structure. `tabHistory` has bounded URL/title history. |
| Settings and backup schedule | `chrome.storage.local` | Includes `clientId`, `localBackupInterval`, `localBackupLastTimeCompleted`, and a snapshot-dirty flag. This is separate from `Nodes`. |
| Pending crash-restore matching | `chrome.storage.session` | `browserSessionStarted` and `pendingBrowserRestore`; survives worker suspension but not browser exit. Not an independent copy of the saved tree. |
| Active worker and sidebar copies | JavaScript memory | Rebuilt after their contexts restart. A sidebar's visible state is not proof that disk has committed it. |
| Undo/redo | Each TreeView's in-memory `undoStack` / `redoStack` | Supports several tree actions, including deletion, while that view survives. No durable undo journal. Ordinary browser tab closes do not create these view undo entries. |
| External backups | Browser downloads, `tktsto.YYYY-MM-DD_HH-MM-SS.CLIENT.json` | Plain JSON containing metadata and serialized nodes. These can survive extension removal if the files are retained. |
| Internal snapshot/journal stores | IndexedDB stores `Snapshots` and `Transactions` | Created by the extension, but ordinary operation does not maintain a usable automatic snapshot/journal recovery system. Separate recovery scripts can write rollback snapshots directly. |
| Browser-native tab session | Chrome's own profile/session storage | Chrome controls this independently. It is not a backup of TKTSTO labels, notes, or hierarchy. |

The Chrome Default profile's extension registration points to this source folder and records extension ID **`pmdfmdjcbeffibenoechnmggldgdolkf`**. These paths exist:

- [IndexedDB directory](</Users/revin/Library/Application Support/Google/Chrome/Default/IndexedDB/chrome-extension_pmdfmdjcbeffibenoechnmggldgdolkf_0.indexeddb.leveldb>) — `/Users/revin/Library/Application Support/Google/Chrome/Default/IndexedDB/chrome-extension_pmdfmdjcbeffibenoechnmggldgdolkf_0.indexeddb.leveldb`
- [Local extension settings](</Users/revin/Library/Application Support/Google/Chrome/Default/Local Extension Settings/pmdfmdjcbeffibenoechnmggldgdolkf>) — `/Users/revin/Library/Application Support/Google/Chrome/Default/Local Extension Settings/pmdfmdjcbeffibenoechnmggldgdolkf`
- [Chrome session directory](</Users/revin/Library/Application Support/Google/Chrome/Default/Sessions>) — browser-owned state, separate from the extension database.

These are observed profile paths, not a claim that their records match the latest uploaded export. Source files in the workspace do **not** contain the persistent tab database. Copying or backing up the source folder alone does not preserve the saved tree. IndexedDB is a multi-file browser database; copying one `.ldb` file is not a complete backup.

[Storage schema](/Users/revin/codex/tktsto-chromium/bkgd/idb.js), [serialized fields](/Users/revin/codex/tktsto-chromium/common/tree.js), [settings](/Users/revin/codex/tktsto-chromium/common/config.js), and [browser-session state](/Users/revin/codex/tktsto-chromium/bkgd/browser-restore.js) provide the implementation evidence.

**How saving and restoration work**

1. Each node serializes into `{ key: node.id, data: JSON.stringify(node.toDict()) }`. Node data includes URLs, titles, annotations, timestamps, hierarchy, load state, browser attachment IDs, and history.
2. Creating, moving or deleting a node saves the affected node/parent links together in one IndexedDB read/write transaction. The primary `saveNodes()` API waits for transaction completion and rejects an abort. The database transaction itself is atomic.
3. Field changes use `NodeStore.saveIfChanged()`. The underlying mutation and any awaited notifications/browser work happen before this wrapper persists the result. Memory and disk can therefore differ temporarily, or indefinitely after a failure.
4. Startup reads the root and all node records, reconstructs the tree, repairs orphan/dangling/cyclic links where possible, and writes the repaired links. Known parents are preferred; otherwise a `lost+found` branch receives recoverable records. This cannot recreate deleted records or fields that never committed.
5. The saved tree is reconciled with Chrome's currently open windows/tabs. Same-browser-session matching prefers tab IDs; otherwise startup falls back to URL-based window/tab matching. A separate, stricter matcher handles windows restored later by Chrome.
6. Backups serialize the current context's in-memory tree. They remove transient browser IDs, marks and recovery tokens. Import creates a new branch with new node IDs and unloaded tabs; it adds to the existing tree rather than replacing it. Backup files do not contain full browser navigation stacks, page memory, form state, cookies, logins, or all extension settings.

**Confirmed findings, in priority order**

**1. High — Startup can consume a deliberately saved entry and later delete it.**

The startup matcher includes ordinary unloaded tabs, accepts partial window matches with as little as one matching URL, and selects among ties. It does not apply the complete-window, privacy, pinned-state and ambiguity checks used by the newer late-restoration matcher.

Reproduction: save an unannotated grey tab under a saved window; simulate a new browser session containing a separately opened tab at the same URL; run the real startup merge; close the new live tab. Startup attaches it to the grey entry, and normal close handling then deletes that saved entry and its history from IndexedDB. A label on the parent window does not protect an unannotated child. Annotating/bookmarking the tab protects it from ordinary close deletion, but does not itself prove that a URL match represents the same historical tab.

Evidence: [startup candidate selection](/Users/revin/codex/tktsto-chromium/common/tree.js:1733), [inclusion of grey saved tabs](/Users/revin/codex/tktsto-chromium/common/tree.js:1753), [URL attachment](/Users/revin/codex/tktsto-chromium/common/tree.js:1800), [close deletion](/Users/revin/codex/tktsto-chromium/common/tree.js:937).

Fix priority: preserve explicitly saved entries as independent records; restrict automatic startup recovery to credible previously live candidates and reject ambiguous matches. Reuse the stricter restoration criteria where applicable.

**2. High — Failed writes leave uncommitted data in memory, with no durable retry or rollback.**

Ordinary add/edit/move/delete paths mutate the tree before saving. Although IndexedDB correctly rolls back an aborted transaction, the ordinary tree mutation does not roll back with it. The late-browser-restoration path has its own rollback, but general edits lack it.

Reproductions with a real aborted IndexedDB transaction:

- Adding a node fails on disk, yet the new node remains in memory. Saving the parent afterward can persist a child ID for a record that does not exist. Reload repairs the dangling link and the new content disappears.
- Editing a note fails on disk, yet memory shows the new note. Repeating exactly the same edit returns as a no-op, leaving the old note on disk.
- Delaying a note-change notification demonstrates that its database write has not even started when the changed value is already available to notification recipients.

Triggers include an aborted write, storage/disk failures, and interruption before commit. This does not mean a normal worker suspension necessarily damages the database; it means edits not successfully committed have no reliable recovery path. The UI/message flow also lacks a general persistent “unsaved changes” error state.

Evidence: [save wrapper](/Users/revin/codex/tktsto-chromium/bkgd/nodestore.js:31), [mutation before persistence](/Users/revin/codex/tktsto-chromium/common/node.js:862), [note mutation and notification](/Users/revin/codex/tktsto-chromium/common/node.js:901), [transaction handling](/Users/revin/codex/tktsto-chromium/bkgd/idb.js:75), [message error-state gap](/Users/revin/codex/tktsto-chromium/common/tree.js:1479).

Fix priority: stage a mutation, commit, then acknowledge/publish it; or roll back memory and surface a retryable error on failure. Failed edits must remain explicitly dirty even when the next request repeats the same values.

**3. High recovery impact — One malformed stored record can stall the whole tree load.**

`loadAllNodes()` parses JSON inside a cursor success callback without catching parse errors or settling the outer promise on transaction abort. Injecting one malformed record produced a browser JavaScript error and left the load promise pending. The single-record loader has the same uncaught-parse pattern. Startup readiness then never completes; the good records are not necessarily erased, but the tree can appear unavailable.

The probe demonstrates behavior if a record is malformed; it does not establish that normal writes or a crash will produce invalid JSON, or that the user's database currently contains such a record. Root absence is a different case: the loader creates a root and attempts to recover remaining records.

There is no automatic snapshot fallback: that startup code is commented out. Also, `IDB.saveSnapshot()` currently throws `ReferenceError: saveObj is not defined` because it omits `this.`. The normal app does not call this broken helper, so it is an absent safety net rather than an active daily write failure. Recovery scripts that write their own snapshots directly are separate.

Evidence: [record parsing](/Users/revin/codex/tktsto-chromium/bkgd/idb.js:108), [single-record parsing](/Users/revin/codex/tktsto-chromium/bkgd/idb.js:142), [snapshot helper](/Users/revin/codex/tktsto-chromium/bkgd/idb.js:127), [disabled snapshot loading](/Users/revin/codex/tktsto-chromium/bkgd/treestore.js:45).

Fix priority: catch and report malformed records, settle all error/abort paths, offer a read-only salvage export, and preserve the original database before repairs. Implement validated checkpoints and explicit recovery from them.

**4. Medium — Backup imports can silently omit recoverable records or leave a partial branch.**

Import only walks child lists reachable from `root`. It warns and skips missing children, ignores detached records, and lacks a visited-ID/cycle guard. This is weaker than the database startup repair. Nodes commit individually, so a failed import does not roll back earlier nodes. The options UI displays `response.total` but discards `response.status`, which contains the actual import error.

Reproductions: a file with an unreachable but intact note and a missing child was reported without an import error while the note was skipped. A write failure on the third import write left the first imported content committed even though the result reported `total=0`. Retrying that file can add another partial/full copy. Cycle protection is a source-review finding; no unbounded cyclic import was run.

Evidence: [skipped missing records](/Users/revin/codex/tktsto-chromium/bkgd/bkgd.js:1181), [recursive per-node import](/Users/revin/codex/tktsto-chromium/bkgd/bkgd.js:1221), [error status](/Users/revin/codex/tktsto-chromium/bkgd/bkgd.js:1157), [UI ignores status](/Users/revin/codex/tktsto-chromium/options/options.js:321).

Fix priority: validate the entire graph and expected counts before writing; recover or explicitly report orphans; reject cycles; stage and commit the imported branch atomically; display errors and retained/skipped counts accurately.

**5. Medium — A backup preparation exception can stop further backups in that context.**

`localBackupInProgress` is set before serialization and URL preparation. Cleanup handlers are only installed later around the download. An exception during preparation leaves the flag true; every subsequent request returns immediately. An injected serialization failure reproduced this. Restarting that worker/view resets the flag; it is not a permanent on-disk setting.

The code handles ordinary rejected/interrupted downloads better: those handlers clear the flag. However, failures are generally console warnings, and normal completion does not parse or test-import the downloaded file. Automatic backups default to disabled (`localBackupInterval: 0`). I did not verify whether this user's setting overrides that default.

Evidence: [early backup flag](/Users/revin/codex/tktsto-chromium/common/tree.js:298), [late cleanup handlers](/Users/revin/codex/tktsto-chromium/common/tree.js:344), [backup default](/Users/revin/codex/tktsto-chromium/bkgd/bkgd.js:55).

Fix priority: catch failures across the entire preparation/download lifecycle, clear or reconcile the flag on every terminal path, and expose backup failure/last successful completion visibly. Validate exported graph counts and restoreability.

**Other ways tabs or history can disappear**

| Situation | Expected effect in this implementation |
|---|---|
| Close an ordinary browser tab | Its saved node and `tabHistory` are deleted if it has no protective metadata. Children may be promoted. This is intentional behavior, not necessarily corruption. |
| Add a label/note/checkbox, bookmark it, or pin a non-new-tab page | Ordinary tab closure retains the record. Direct explicit tree deletion still deletes it. |
| Use Unload, or close an entire window | Normally retains saved tab records. Window closure uses `wasLoaded` for later reopening. |
| Delete a branch | Descendants are removed. View undo may restore the serialized tree while that view survives; it does not restore full browser page/session state. Recursive deletion consists of multiple commits, so interruption can leave a partially deleted branch. |
| Navigate repeatedly or receive many title updates | Only eight URL-change pairs and eight title-change pairs are retained per tab. Earlier entries are trimmed, including on load/import. Navigation not observed while the worker is inactive cannot be fully reconstructed from the current URL. |
| Move a tab to an app or popup | Chrome app/popup windows are excluded. Moving into one invokes ordinary close-style retention/deletion rules even though the browser tab remains open there. |
| Use the duplicate badge as proof of identical pages | The badge deliberately ignores URL fragments and some query parameters. Distinct application routes can be marked as duplicates. The badge itself is visual and does not delete anything. |
| Remove the extension, delete/replace the profile, explicitly clear its storage, or lose the disk | The persistent tree can be lost. External JSON backups/profile backups are needed. Ordinary web cache clearing is not being equated with clearing extension data. |
| Change Chrome profile or extension identity | The old data may still exist but be inaccessible from the new origin. This unpacked manifest has no fixed `key`; moving/reinstalling the source can change identity. Preserve the old profile/storage before doing so. |
| Edit code or reload the extension at the same ID/profile | Existing IndexedDB normally remains. Reload can interrupt uncommitted work and resets some runtime state. Source-folder backups alone do not cover tab data. |
| Restore a JSON export | Recovers saved tree data to a new branch, not full browser session state or settings. It can create duplicates because import is additive. |

Retention evidence: [close handling](/Users/revin/codex/tktsto-chromium/common/tree.js:890), [protective metadata](/Users/revin/codex/tktsto-chromium/common/node.js:469), [history limits](/Users/revin/codex/tktsto-chromium/common/node.js:12), [undo scope](/Users/revin/codex/tktsto-chromium/view/treeview.js:58), [app handling](/Users/revin/codex/tktsto-chromium/common/tree.js:1211), [duplicate comparison](/Users/revin/codex/tktsto-chromium/view/treeview.js:3536).

No implemented remote tree replication or `chrome.storage.sync` path was found in this source. Chrome account sync should not be treated as a backup of this IndexedDB tree. The manifest does not request `unlimitedStorage`; write failures are not given dedicated quota/disk handling. This audit makes no claim that this profile is near its storage quota or that automatic eviction is occurring.

**What is already protected**

The current atomic structural transactions, delayed-write filtering for deleted nodes, and startup orphan repair all passed the existing regression suite. The stricter late-restoration matcher preserves original IDs/annotations/hierarchy, checks exact URLs and multiplicity, refuses ambiguous cases, and rolls memory back if its combined attach/delete transaction fails. Existing tests also passed for queued close events after worker restart, whole-window retention, and history round trips. These safeguards substantially reduce the older broken-link and duplicate-growth failures; they do not remove the findings above.

**Evidence about the previously missing tabs**

The existing [eight-file comparison](/Users/revin/codex/tktsto-chromium/missing-tabs-report-2026-11-24/report.md) reports 22 missing tab records whose last-known URLs are also absent, plus 363 absent IDs whose URLs remain under other IDs. Its two latest structure snapshots have matching IDs/URLs. These exported states cannot establish whether a particular disappearance was an intentional close, navigation, cleanup, or a bug. The earlier [chronological recovery audit](/Users/revin/codex/tktsto-chromium/recovery/audit-2026-11-24/comparison-report.md) separately documents identity/structure changes; it should not be collapsed into a count of missing unique pages. I reviewed those reports as historical context rather than rerunning their private-data comparison here.

**Practical protection and implementation order**

Keep timestamped JSON backups at an interval that matches the amount of work you are willing to lose, and retain older copies outside the browser profile and outside the Downloads cleanup lifecycle. Check that files actually complete and occasionally verify restoration in a separate disposable profile. Keep an external/device backup too: same-disk JSON files do not protect against disk loss. For raw profile backups, close Chrome and copy the complete relevant profile/storage, not individual LevelDB files.

Use Unload or add protective metadata when you intend a tab to remain saved. Treat the duplicate badge as a navigation aid, and compare complete URLs before deleting supposed copies. Do not remove/reinstall the extension to troubleshoot a blank tree before preserving its data; a stalled parser can leave intact records recoverable.

Engineering order: fix unsafe startup attachment; make persistence failure atomic from the user's perspective; add durable deletion recovery/checkpoints and robust loading; validate/atomically import backups; then make backup health visible and resilient. These fixes were not applied as part of this audit.

**Verification**

Passed existing suites: `tests/storage-windows.cjs`, `tests/tab-close.cjs`, `tests/tab-history.cjs`, `tests/browser-restore.cjs`. Together they reported 45 test groups. The [audit probe](/Users/revin/codex/tktsto-chromium/audit/data-loss-2026-11-24/probe.cjs) reproduced the nine observations described above using real IndexedDB and mocked browser events/APIs in an isolated browser context. The intentionally malformed JSON generated the one expected page error. No operating-system crash, disk exhaustion, or live-user-profile mutation was performed.

Reproduce the probe on this machine:

```sh
NODE_PATH='/Users/revin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules' node audit/data-loss-2026-11-24/probe.cjs
```

The probe asserts that the audited failure modes currently exist. Its expectations should be inverted or replaced with regression tests when the implementation is fixed.
