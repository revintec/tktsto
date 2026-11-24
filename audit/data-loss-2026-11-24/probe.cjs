// Read-only source audit: all mutations occur in disposable browser databases.
// Run: NODE_PATH=/path/to/node_modules node audit/data-loss-2026-11-24/probe.cjs
// These assertions document current failure modes; they should change after fixes.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') return res.end('<!doctype html><title>Isolated storage audit</title>');
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
    let source = await fs.readFile(filename, 'utf8');
    if (pathname === '/bkgd/bkgd.js')
      source = source.replace('const bkgd = new Bkgd();\nbkgd.init();', 'export { Bkgd };');
    res.setHeader('Content-Type', 'text/javascript');
    res.end(source);
  } catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const findings = await page.evaluate(async () => {
      let windows = [], downloads = 0;
      window.chrome = {
        runtime: { getURL: value => new URL(value, location.origin).href,
          sendMessage: async () => ({}) },
        storage: { local: { set: async () => {} },
          session: { get: async () => ({}), set: async () => {} } },
        windows: { getAll: async () => windows,
          get: async id => windows.find(win => win.id === id) },
        tabs: { remove: async () => {},
          query: async ({ windowId }) => windows.find(win => win.id === windowId)?.tabs || [] },
        downloads: { download: async () => ++downloads,
          onChanged: { addListener () {}, removeListener () {} } }
      };
      const { Tree } = await import('/common/tree.js');
      const { NodeStore } = await import('/bkgd/nodestore.js');
      const { TreeStore } = await import('/bkgd/treestore.js');
      const { IDB } = await import('/bkgd/idb.js');
      const { Bkgd } = await import('/bkgd/bkgd.js');
      const { emit, jsonSchema } = await import('/common/common.js');
      emit.disabled = true;
      class TestNode extends NodeStore {
        async reorderAllTabsInThisWindow () {}
        updateOpenerTabId () {}
        async setActiveTab () {}
      }
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      let counter = 0;
      const fixture = async () => {
        const tree = new Tree(TestNode), bkgd = new Bkgd();
        tree.bkgd = bkgd;
        bkgd.tree = tree;
        bkgd.treeLoaded = Promise.resolve();
        bkgd.idGen = { newId: () => `audit-node-${++counter}` };
        bkgd.browserRestore.schedule = () => {};
        tree.resolveTreeLoaded();
        tree.reattachOrphanedNodes = TreeStore.prototype.reattachOrphanedNodes;
        tree.db = new IDB();
        tree.db.dbName = `audit-${++counter}`;
        tree.db.init();
        await tree.db.saveNode(tree.root);
        return tree;
      };
      const add = (parent, id, fields = {}) => parent.addChild(parent.nodes.length,
        { id, ...fields }, { reason: 'audit' });
      const reload = tree => TreeStore.prototype.loadTreeFromDB.call(tree);
      const abortNextWrite = async tree => {
        const database = await tree.db.db;
        const original = database.transaction.bind(database);
        database.transaction = (...args) => {
          const txn = original(...args);
          if (args[1] === 'readwrite') {
            database.transaction = original;
            const objectStore = txn.objectStore.bind(txn);
            txn.objectStore = name => {
              const store = objectStore(name), put = store.put.bind(store);
              store.put = record => { const request = put(record); txn.abort(); return request; };
              return store;
            };
          }
          return txn;
        };
      };
      const findings = [];

      let tree = await fixture();
      await abortNextWrite(tree);
      let rejected = false;
      try { await add(tree.root, 'unsaved', { note: 'new note' }); } catch { rejected = true; }
      check(rejected && tree.nodes.unsaved && !(await tree.db.loadNode('unsaved')),
        'Failed add leaves an unsaved node in memory');
      await tree.db.saveNode(tree.root);
      check((await tree.db.loadNode('root')).nodes.includes('unsaved'),
        'Later parent save can persist a dangling child link');
      await reload(tree);
      check(!tree.nodes.unsaved, 'The unsaved node disappears on reload');
      findings.push('Aborted add: memory retains the new node, later writes can save a dangling link, reload loses the new content.');

      tree = await fixture();
      const note = await add(tree.root, 'note', { note: 'old' });
      await abortNextWrite(tree);
      try { await note.setNotes(undefined, 'new', { reason: 'audit' }); } catch {}
      check(note.note === 'new' && (await tree.db.loadNode('note')).note === 'old',
        'Failed field write diverges from durable content');
      await note.setNotes(undefined, 'new', { reason: 'audit' });
      check((await tree.db.loadNode('note')).note === 'old',
        'Repeating the identical edit is a no-op, not a retry');
      findings.push('Aborted note edit: memory shows new content, disk keeps old content, repeating the same edit does not retry.');

      tree = await fixture();
      const delayed = await add(tree.root, 'delayed', { note: 'before' });
      let release, arrived;
      const waiting = new Promise(resolve => { arrived = resolve; });
      chrome.runtime.sendMessage = () => { arrived(); return new Promise(resolve => { release = resolve; }); };
      emit.disabled = false;
      const edit = delayed.setNotes(undefined, 'after', { reason: 'userAction' });
      await waiting;
      check(delayed.note === 'after' && (await tree.db.loadNode('delayed')).note === 'before',
        'Notification is awaited before field persistence');
      release({});
      await edit;
      emit.disabled = true;
      chrome.runtime.sendMessage = async () => ({});
      findings.push('Note changes are visible to notification recipients before the database write starts.');

      tree = await fixture();
      const savedWindow = await add(tree.root, 'saved-window', { type: 'window', label: 'Saved workspace' });
      await add(savedWindow, 'saved-page', { url: 'https://example.test/saved',
        title: 'Saved page', loaded: false, wasLoaded: false,
        tabHistory: [{ url: 'https://example.test/earlier', changedAt: 1, kind: 'url' }] });
      windows = [{ id: 7, type: 'normal', incognito: false,
        tabs: [{ id: 70, windowId: 7, index: 0, url: 'https://example.test/saved',
          title: 'Saved page', active: true, pinned: false, incognito: false }] }];
      tree.bkgd.detectSameBrowserSession = async () => false;
      await tree.bkgd.mergeOpenWindowsIntoTree();
      check(tree.nodes['saved-page'].loaded && tree.nodes['saved-page'].tabId === 70,
        'Startup reuses an intentionally unloaded entry by URL');
      await tree.onTabRemoved(70, { windowId: 7, isWindowClosing: false });
      check(!tree.nodes['saved-page'] && !(await tree.db.loadNode('saved-page')),
        'Closing the unrelated same-URL browser tab deletes that saved entry');
      findings.push('Startup URL fallback attaches a new live tab to an intentionally saved grey entry; closing the live tab deletes the saved entry and history.');

      tree = await fixture();
      const imported = { $schema: jsonSchema, metadata: { sessionStartDate: 1, exportDate: 2 },
        nodes: { root: { id: 'root', nodes: ['missing'], ctime: 1 },
          detached: { id: 'detached', parent: 'root', note: 'recoverable content' } } };
      const response = await tree.bkgd.importBackupFileGeneric(
        { data: imported, filename: 'incomplete.json' }, tree.bkgd.importBackupFile);
      check(response.total === 0 && !response.status.includes('error'),
        'Importer reports success after skipping dangling links');
      check(!Object.values(tree.nodes).some(node => node.note === 'recoverable content'),
        'Importer skips orphan records that the DB loader can recover');
      findings.push('Backup import reports success while skipping missing children and stored orphan records.');

      tree = await fixture();
      const sourceBackup = { $schema: jsonSchema, metadata: { sessionStartDate: 1, exportDate: 2 },
        nodes: { root: { id: 'root', nodes: ['a', 'b'], ctime: 1 },
          a: { id: 'a', note: 'first' }, b: { id: 'b', note: 'second' } } };
      const originalSave = tree.db.saveNodes.bind(tree.db);
      let writes = 0;
      tree.db.saveNodes = (...args) => {
        if (++writes === 3) return Promise.reject(new Error('injected import write failure'));
        return originalSave(...args);
      };
      const partial = await tree.bkgd.importBackupFileGeneric(
        { data: sourceBackup, filename: 'partial.json' }, tree.bkgd.importBackupFile);
      const persisted = Object.values(await tree.db.loadAllNodes());
      check(partial.status.includes('Import error') && partial.total === 0
        && persisted.some(n => n.note === 'first') && !persisted.some(n => n.note === 'second'),
        'Import commits part of a tree before an error');
      findings.push('Import failure after earlier commits leaves a partial imported branch despite total=0.');

      tree = await fixture();
      const makeBackup = tree.makeBackupObject.bind(tree);
      tree.makeBackupObject = () => { throw new Error('injected serialization failure'); };
      try { await tree.downloadBackupNow(); } catch {}
      tree.makeBackupObject = makeBackup;
      await tree.downloadBackupNow();
      check(tree.localBackupInProgress && downloads === 0,
        'Backup preparation failure latches backup-in-progress until context restarts');
      findings.push('An exception before download setup permanently blocks further backups in that tree context.');

      tree = await fixture();
      let snapshotError;
      try { await tree.db.saveSnapshot('audit', tree); } catch (err) { snapshotError = String(err); }
      check(snapshotError?.includes('saveObj is not defined'), 'saveSnapshot has an unqualified saveObj call');
      findings.push('Built-in IDB.saveSnapshot throws ReferenceError; normal startup does not load snapshots anyway.');

      tree = await fixture();
      const database = await tree.db.db;
      await new Promise((resolve, reject) => {
        const txn = database.transaction('Nodes', 'readwrite');
        txn.oncomplete = resolve;
        txn.onabort = () => reject(txn.error);
        txn.objectStore('Nodes').put({ key: 'broken', data: '{invalid json' });
      });
      const outcome = await Promise.race([
        tree.db.loadAllNodes().then(() => 'resolved', () => 'rejected'),
        new Promise(resolve => setTimeout(() => resolve('pending'), 300))
      ]);
      check(outcome === 'pending', 'Bad record leaves load promise unsettled');
      findings.push('One malformed stored JSON record throws in the cursor callback and leaves loadAllNodes pending.');
      return findings;
    });
    assert.equal(pageErrors.length, 1, 'Only the deliberately malformed JSON should produce a page error');
    assert.match(pageErrors[0], /JSON|property name/i);
    console.log(JSON.stringify({ findings, expectedPageErrors: pageErrors }, null, 2));
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => server.close());
