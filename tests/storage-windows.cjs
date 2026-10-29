// Run with Playwright available: node tests/storage-windows.cjs
// Set CHROME_PATH to use an installed Chrome instead of Playwright's Chromium.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/') return res.end('<!doctype html><title>Storage and window regressions</title>');
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
    let source = await fs.readFile(filename, 'utf8');
    // Import the real background handlers without starting a service worker.
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
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const passed = await page.evaluate(async () => {
      let windows = [], tabs = [], removedTabs = [];
      window.chrome = {
        runtime: { getURL: value => new URL(value, location.origin).href,
          sendMessage: async () => ({}) },
        storage: { local: { set: async () => {} } },
        windows: {
          get: async id => {
            const win = windows.find(win => win.id === id);
            if (!win) throw new Error('No window');
            return win;
          },
          getAll: async () => windows
        },
        tabs: {
          query: async query => tabs.filter(tab => tab.windowId === query.windowId
            && (!query.active || tab.active)),
          get: async id => {
            const tab = tabs.find(tab => tab.id === id);
            if (!tab) throw new Error('No tab');
            return tab;
          },
          remove: async id => { removedTabs.push(id); }
        }
      };
      const { Tree } = await import('/common/tree.js');
      const { NodeStore } = await import('/bkgd/nodestore.js');
      const { TreeStore } = await import('/bkgd/treestore.js');
      const { IDB } = await import('/bkgd/idb.js');
      const { Bkgd } = await import('/bkgd/bkgd.js');
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      // Browser layout/focus is outside these tests; keep real tree mutations,
      // notifications, event handling, and IndexedDB transactions.
      class TestNode extends NodeStore {
        async reorderAllTabsInThisWindow () {}
        updateOpenerTabId () {}
        async setActiveTab () {}
      }
      let counter = 0;
      const fixture = async () => {
        const tree = new Tree(TestNode);
        const bkgd = new Bkgd();
        bkgd.tree = tree;
        bkgd.treeLoaded = Promise.resolve();
        bkgd.idGen = { newId: () => `node-${++counter}` };
        tree.bkgd = bkgd;
        tree.resolveTreeLoaded();
        tree.reattachOrphanedNodes = TreeStore.prototype.reattachOrphanedNodes;
        tree.db = new IDB();
        tree.db.dbName = `regression-${++counter}`;
        tree.db.init();
        await tree.db.saveNode(tree.root);
        return tree;
      };
      const add = (parent, id, fields = {}) => parent.addChild(parent.nodes.length,
        { ...fields, id }, { reason: 'testSetup' });
      const reload = tree => TreeStore.prototype.loadTreeFromDB.call(tree);
      const consistent = async tree => {
        const records = await tree.db.loadAllNodes();
        const seen = new Set();
        const visit = id => {
          check(!seen.has(id), `Duplicate/cyclic persisted node ${id}`);
          seen.add(id);
          const node = records[id];
          check(!!node, `Missing persisted node ${id}`);
          for (const child of node.nodes) {
            check(records[child]?.parent === id, `Broken parent link ${id} -> ${child}`);
            visit(child);
          }
        };
        visit('root');
        check(seen.size === Object.keys(records).length, 'No orphan records remain');
        return records;
      };
      const passed = [];
      let tree = await fixture();
      const parent = await add(tree.root, 'parent');
      let release, reached;
      const stalled = new Promise(resolve => { release = resolve; });
      const waiting = new Promise(resolve => { reached = resolve; });
      parent.reorderAllTabsInThisWindow = () => { reached(); return stalled; };
      const adding = parent.addChild(0, { id: 'child' }, { reason: 'userAction' });
      await waiting;
      check((await consistent(tree)).parent.nodes[0] === 'child',
        'An add commits before yielding to browser reordering');
      release();
      await adding;
      passed.push('add survives worker interruption during browser work');

      tree = await fixture();
      const a = await add(tree.root, 'a');
      await add(a, 'b');
      await add(a, 'c');
      await a.moveTo(a, 1, { reason: 'testSetup' });
      await consistent(tree);
      await reload(tree);
      check(tree.nodes.a.parent === tree.root && !tree.root.nodes.some(n => n.label === 'lost+found'),
        'Moving into own child list persists the actual final parent');
      passed.push('self-child move, promotion, and reload retain every link');

      tree = await fixture();
      const target = await add(tree.root, 'target');
      const unlock = await target.writeLock.lock();
      const changing = target.setNotes('Changed', '', { reason: 'testSetup' });
      await target.deleteSelf({ reason: 'testSetup' });
      unlock();
      await changing;
      check(!(await consistent(tree)).target, 'Delayed writes cannot resurrect a deleted node');
      passed.push('concurrent edit and delete do not recreate orphan records');

      tree = await fixture();
      await add(tree.root, 'original');
      const database = await tree.db.db;
      const transaction = database.transaction.bind(database);
      let committed = false;
      database.transaction = (...args) => {
        const txn = transaction(...args);
        txn.addEventListener('complete', () => { committed = true; });
        return txn;
      };
      await tree.db.saveNode(tree.root);
      check(committed, 'A successful save waits for transaction completion');
      database.transaction = (...args) => {
        const txn = transaction(...args);
        const objectStore = txn.objectStore.bind(txn);
        txn.objectStore = name => {
          const store = objectStore(name), put = store.put.bind(store);
          let count = 0;
          store.put = record => {
            const request = put(record);
            if (++count === 2) txn.abort();
            return request;
          };
          return store;
        };
        return txn;
      };
      let rejected = false;
      try {
        await tree.db.saveNodes([
          { id: 'root', toDict: () => ({ id: 'root', parent: 'root', nodes: ['new'] }) },
          { id: 'new', toDict: () => ({ id: 'new', parent: 'root', nodes: [] }) }
        ], ['original']);
      } catch { rejected = true; }
      database.transaction = transaction;
      check(rejected, 'An aborted transaction rejects the save');
      const intact = await consistent(tree);
      check(intact.original && !intact.new, 'An interrupted batch preserves the previous tree');
      passed.push('real IndexedDB commit completion and atomic rollback');

      tree = await fixture();
      await add(tree.root, 'window', { type: 'window', windowId: 7, loaded: true });
      await add(tree.nodes.window, 'branch', { url: 'https://branch.test', loaded: true, tabId: 70 });
      await add(tree.nodes.branch, 'note', { note: 'Keep me' });
      let records = await tree.db.loadAllNodes();
      records.window.nodes = [];
      await tree.db.saveObj(tree.db.nodeDbName, 'window', records.window);
      await reload(tree);
      check(tree.nodes.branch.parent === tree.nodes.window && tree.nodes.branch.loaded,
        'A detached branch returns to its saved parent and keeps live identity');
      check(!tree.root.nodes.some(n => n.label === 'lost+found'), 'Known parents avoid lost+found');
      await consistent(tree);
      passed.push('older interrupted writes recover the original parent');

      records = await tree.db.loadAllNodes();
      records.root.nodes.push('missing', 'window');
      records.branch.nodes.push('window');
      records.note.parent = 'wrong-parent';
      for (const id of ['root', 'branch', 'note'])
        await tree.db.saveObj(tree.db.nodeDbName, id, records[id]);
      await reload(tree);
      await consistent(tree);
      check(!tree.nodes.missing && tree.nodes.note.note === 'Keep me', 'Malformed links preserve actual content');
      passed.push('dangling, duplicate, cyclic, and stale parent links repair safely');

      tree = await fixture();
      for (const node of [
        { id: 'orphan', parent: 'missing', nodes: ['child'], note: 'Orphan note' },
        { id: 'child', parent: 'orphan', nodes: [], url: 'https://saved.test' },
        { id: 'cycle-a', parent: 'cycle-b', nodes: ['cycle-b'] },
        { id: 'cycle-b', parent: 'cycle-a', nodes: ['cycle-a'] }
      ]) await tree.db.saveObj(tree.db.nodeDbName, node.id, node);
      await reload(tree);
      await consistent(tree);
      check(tree.nodes.orphan.parent.label === 'lost+found' && tree.nodes.child.parent === tree.nodes.orphan,
        'True orphans remain recoverable with their children');
      const recoveredCount = Object.keys(tree.nodes).length;
      await reload(tree);
      await consistent(tree);
      check(Object.keys(tree.nodes).length === recoveredCount, 'Recovery is stable across repeated restarts');
      passed.push('true orphan branches and disconnected cycles recover once');

      tree = await fixture();
      windows = [
        { id: 7, type: 'normal' }, { id: 8, type: 'popup' }, { id: 9, type: 'app' },
        { id: 10, type: 'panel' }, { id: 11, type: 'devtools' }
      ];
      tabs = windows.map(win => ({ id: win.id * 10, windowId: win.id, index: 0,
        url: `https://window-${win.id}.test`, title: `Window ${win.id}`, active: true }));
      const queuedWindow = {}, queuedTab = {};
      tree.bkgd.windowsLoading.push(queuedWindow);
      tree.bkgd.nodesLoading.push(queuedTab);
      for (const win of windows.slice(1)) {
        const tab = tabs.find(tab => tab.windowId === win.id);
        // Test the troublesome ordering: tab/update precede window creation.
        await tree.onTabCreated(tab);
        await tree.onTabUpdated(tab.id, { title: tab.title }, tab);
        await tree.onWindowCreated(win, { reason: 'onWindowCreated' });
        await tree.onTabAttached(tab.id, { newWindowId: win.id, newPosition: 0 });
      }
      check(Object.keys(tree.nodes).length === 1, 'Apps/popups cannot create placeholder nodes');
      check(tree.bkgd.windowsLoading[0] === queuedWindow && tree.bkgd.nodesLoading[0] === queuedTab,
        'App events cannot consume saved-window/tab restoration queues');
      tree.bkgd.windowsLoading = [];
      tree.bkgd.nodesLoading = [];
      await tree.onTabCreated(tabs[0]);
      await tree.onWindowCreated(windows[0], { reason: 'onWindowCreated' });
      check(tree.getNodeByTabId(70)?.getWindowNode()?.windowId === 7, 'Normal tab-first creation still works');
      await tree.onTabCreated({ id: 999, windowId: 999 });
      check(!tree.root.getWindowId(999), 'Stale inaccessible window events do not create placeholders');
      await tree.onTabAttached(70, { newWindowId: 999, newPosition: 0 });
      check(!!tree.getNodeByTabId(70), 'A failed window lookup does not delete a tracked tab');
      const lateTab = { id: 120, windowId: 12, index: 0, active: true,
        url: 'https://late-window.test', title: 'Late window' };
      tabs.push(lateTab);
      await tree.onTabCreated(lateTab);
      windows.push({ id: 12, type: 'normal' });
      await tree.bkgd.onWindowCreated(windows.at(-1));
      check(!!tree.getNodeByTabId(120), 'Window creation catches up a tab event whose window lookup failed');
      passed.push('app filtering across event orderings, updates, and restoration queues');

      tabs[0].windowId = 8;
      await tree.onTabAttached(70, { newWindowId: 8, newPosition: 0 });
      check(!tree.getNodeByTabId(70) && !removedTabs.length, 'Moving into an app forgets the tab without closing it');
      tabs[0].windowId = 7;
      await tree.onTabAttached(70, { newWindowId: 7, newPosition: 0 });
      check(!!tree.getNodeByTabId(70), 'Moving back into a normal window restores tracking');
      const annotated = tree.getNodeByTabId(70);
      await annotated.setNotes('', 'Keep my note', { reason: 'testSetup' });
      tabs[0].windowId = 8;
      await tree.onTabAttached(70, { newWindowId: 8, newPosition: 0 });
      check(!annotated.loaded && annotated.note === 'Keep my note', 'App moves preserve tab annotations');
      await tree.onTabActivated(8, 70);
      check(!annotated.loaded, 'App activation does not reactivate saved history');
      tabs[0].windowId = 7;
      await tree.onTabAttached(70, { newWindowId: 7, newPosition: 0 });
      check(annotated.loaded && annotated.tabId === 70 && annotated.note === 'Keep my note',
        'Annotated tabs reconnect to the same node when returning to the browser');
      await consistent(tree);
      passed.push('tabs move between browser and app without being closed');

      tree = await fixture();
      windows = windows.slice(0, 3).map(win => ({ ...win,
        tabs: tabs.filter(tab => tab.windowId === win.id) }));
      for (const win of windows.slice(1)) {
        const node = await add(tree.root, `old-${win.id}`, { type: 'window', windowId: win.id, loaded: true });
        for (const tab of win.tabs)
          await add(node, `old-tab-${tab.id}`, { ...tab, tabId: tab.id, loaded: true });
      }
      // Saved annotations must not be erased by the migration.
      tree.nodes['old-tab-90'].note = 'Keep this app note';
      await tree.db.saveNode(tree.nodes['old-tab-90']);
      tree.bkgd.detectSameBrowserSession = async () => true;
      await tree.bkgd.mergeOpenWindowsIntoTree();
      check(!tree.nodes['old-8'], 'Previously tracked plain popup entries are removed');
      check(tree.nodes['old-tab-90'].note === 'Keep this app note' && !tree.nodes['old-tab-90'].loaded,
        'Previously saved app annotations remain as unloaded history');
      check(tree.root.getWindowId(7)?.isLoaded() && !tree.root.getWindowId(9)?.isLoaded(),
        'Startup attaches only normal browser windows');
      check(!removedTabs.length, 'Ignoring app windows never closes their tabs');
      await consistent(tree);
      passed.push('startup excludes apps and cleans generated entries while preserving annotations');
      return passed;
    });
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log(`PASS: ${passed.join('; ')}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
