// Run with Playwright available: node tests/browser-restore.cjs
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
    if (pathname === '/') return res.end('<!doctype html><title>Browser restoration regressions</title>');
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
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const passed = await page.evaluate(async () => {
      let windows = [], session = {}, messages = [], browserWrites = [], panel;
      window.chrome = {
        runtime: { getURL: value => new URL(value, location.origin).href,
          sendMessage: async message => {
            messages.push(message);
            if (message.msg === 'bkgd_getTree') return { nodes: currentTree.serializeNodes() };
            if (message.msg === 'tree_browserRestored' && panel) await panel.tree_browserRestored();
            return {};
          } },
        storage: {
          local: { set: async () => {} },
          session: {
            get: async key => ({ [key]: structuredClone(session[key]) }),
            set: async value => { Object.assign(session, structuredClone(value)); }
          }
        },
        windows: {
          get: async id => {
            const win = windows.find(w => w.id === id);
            if (!win) throw new Error('No window');
            return structuredClone(win);
          },
          getAll: async () => structuredClone(windows)
        },
        tabs: {
          query: async query => structuredClone(windows.flatMap(w => w.tabs).filter(
            t => t.windowId === query.windowId && (!query.active || t.active))),
          remove: async id => browserWrites.push(['remove', id]),
          create: async tab => browserWrites.push(['create', tab]),
          move: async (...args) => browserWrites.push(['move', ...args])
        }
      };
      const { Tree } = await import('/common/tree.js');
      const { NodeStore } = await import('/bkgd/nodestore.js');
      const { IDB } = await import('/bkgd/idb.js');
      const { Bkgd } = await import('/bkgd/bkgd.js');
      const { BrowserRestore } = await import('/bkgd/browser-restore.js');
      class TestNode extends NodeStore {
        // Test browser events, persisted tree edits and view refreshes; tab-bar
        // layout/focus mechanics have separate tests.
        async reorderAllTabsInThisWindow () {}
        updateOpenerTabId () {}
        async setActiveTab () {}
      }
      let sequence = 0, currentTree;
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      const add = (parent, id, fields = {}) => parent.addChild(parent.nodes.length,
        { ...fields, id }, { reason: 'testSetup' });
      const fixture = async (urls = ['https://a.test/', 'https://b.test/']) => {
        if (currentTree) clearTimeout(currentTree.bkgd.browserRestore.timer);
        windows = []; session = {}; messages = []; browserWrites = []; panel = null;
        const bkgd = new Bkgd();
        const tree = currentTree = new Tree(TestNode);
        bkgd.tree = tree; tree.bkgd = bkgd;
        bkgd.treeLoaded = Promise.resolve();
        bkgd.idGen = { newId: () => `generated-${++sequence}` };
        tree.resolveTreeLoaded();
        tree.db = new IDB(); tree.db.dbName = `restore-${++sequence}`; tree.db.init();
        await tree.db.saveNode(tree.root);
        const win = await add(tree.root, 'original', { type: 'window', loaded: true,
          windowId: 1, label: 'Research', note: 'Window notes', incognito: false });
        for (const [index, url] of urls.entries())
          await add(win, `old-${index}`, { loaded: true, tabId: 10 + index, windowId: 1,
            url, title: `Saved ${index}`, note: index === 0 ? 'Original note' : undefined });
        return tree;
      };
      const windowWith = (id, urls, fields = {}) => ({
        id, type: 'normal', incognito: false, focused: true, state: 'normal', ...fields,
        tabs: urls.map((url, index) => ({ id: id * 100 + index, windowId: id,
          url, title: `Restored ${index}`, index, active: index === 0,
          pinned: false, incognito: !!fields.incognito }))
      });
      const boot = async tree => {
        await tree.bkgd.mergeOpenWindowsIntoTree();
        clearTimeout(tree.bkgd.browserRestore.timer);
      };
      const arrival = async (tree, win, tabFirst = false) => {
        windows.push(win);
        if (tabFirst) for (const tab of win.tabs) await tree.bkgd.onTabCreated(tab);
        await tree.bkgd.onWindowCreated(win);
        clearTimeout(tree.bkgd.browserRestore.timer);
      };
      const reconcile = tree => tree.bkgd.browserRestore.reconcile();
      const persisted = async tree => {
        const records = await tree.db.loadAllNodes();
        const visited = new Set();
        const visit = id => {
          check(records[id] && !visited.has(id), 'Every stored node is reachable once');
          visited.add(id);
          for (const child of records[id].nodes) {
            check(records[child]?.parent === id, 'Parent links are committed with children');
            visit(child);
          }
        };
        visit('root');
        check(visited.size === Object.keys(records).length, 'No orphan records');
        return records;
      };
      const passed = [];

      let tree = await fixture();
      await add(tree.nodes['old-0'], 'saved-child', { url: 'https://saved.test/', note: 'Keep child' });
      await add(tree.nodes.original, 'bookmark', { url: 'https://a.test/', bookmark: true });
      const originalCount = Object.keys(tree.nodes).length;
      await boot(tree);
      check(tree.nodes['old-0'].wasLoaded && !tree.nodes['old-0'].loaded, 'Crash demotes old tabs');
      const restored = windowWith(7, ['https://a.test/', 'https://b.test/']);
      await arrival(tree, restored, true);
      restored.tabs[0].title = 'Final restored title';
      await tree.getNodeByTabId(700).setTabFields({ title: restored.tabs[0].title },
        { reason: 'onTabUpdated' });
      check(Object.keys(tree.nodes).length > originalCount, 'Reproduce late-restore temporary duplicates');
      panel = new Tree();
      panel.rebuildNodeFromSerializedHash(panel.root, tree.serializeNodes());
      await reconcile(tree);
      check(tree.root.getWindowId(7) === tree.nodes.original, 'Original window reattached');
      check(tree.getNodeByTabId(700) === tree.nodes['old-0'], 'Original first tab reattached');
      check(tree.getNodeByTabId(701) === tree.nodes['old-1'], 'Original second tab reattached');
      check(tree.nodes['old-0'].note === 'Original note' && tree.nodes.original.note === 'Window notes',
        'Tab/window metadata retained');
      check(tree.nodes['old-0'].tabHistory.some(e => e.title === 'Saved 0')
        && tree.nodes['old-0'].tabHistory.some(e => e.title === 'Restored 0'),
        'Original and temporary restored title histories are both preserved');
      check(tree.nodes['saved-child'].parent === tree.nodes['old-0'] && !tree.nodes.bookmark.loaded,
        'Saved descendants and bookmarks unchanged');
      check(Object.keys(tree.nodes).length === originalCount, 'Temporary duplicate entries removed');
      check(panel.nodes['old-0'].tabId === 700 && Object.keys(panel.nodes).length === originalCount,
        'Connected view receives the reconciled tree');
      check(!browserWrites.length, 'Recovery never opens, closes, or moves live tabs');
      check((await persisted(tree))['old-0'].tabId === 700, 'New attachment persisted');
      await reconcile(tree);
      check(!tree.bkgd.browserRestore.token, 'Recovery consumed once');
      passed.push('late crash restore preserves IDs, hierarchy, metadata, live tabs, storage and views');

      tree = await fixture();
      await boot(tree);
      const staged = windowWith(8, ['https://a.test/']);
      await arrival(tree, staged);
      await reconcile(tree);
      check(!tree.nodes.original.loaded, 'Partial window waits for its other tab');
      staged.tabs.push({ ...windowWith(8, ['https://a.test/', 'https://b.test/']).tabs[1] });
      await tree.bkgd.onTabCreated(staged.tabs[1]);
      await reconcile(tree);
      check(tree.nodes['old-1'].tabId === 801, 'Staged restore completes on later tab event');
      passed.push('partial restore waits for a full window match');

      tree = await fixture();
      await boot(tree);
      const pending = windowWith(9, ['https://a.test/', 'about:blank']);
      pending.tabs[1].pendingUrl = 'https://b.test/';
      await arrival(tree, pending);
      await reconcile(tree);
      check(tree.nodes['old-1'].tabId === 901 && tree.nodes['old-1'].url === 'https://b.test/',
        'Pending URL identifies not-yet-loaded restored pages');
      passed.push('pending URLs reconnect before page load completes');

      tree = await fixture();
      await boot(tree);
      const lateUrl = windowWith(9, ['https://a.test/', 'about:blank']);
      await arrival(tree, lateUrl);
      await reconcile(tree);
      check(!tree.nodes.original.loaded, 'Unknown URL does not match');
      lateUrl.tabs[1].url = 'https://b.test/';
      await tree.bkgd.onTabUpdated(901, { url: 'https://b.test/' }, lateUrl.tabs[1]);
      await new Promise(resolve => setTimeout(resolve, 450));
      check(tree.nodes['old-1'].tabId === 901, 'URL update schedules automatic recovery');
      passed.push('automatic retry when Chrome supplies the URL later');

      tree = await fixture();
      await boot(tree);
      await arrival(tree, windowWith(7, ['https://a.test/', 'https://b.test/']));
      tree.bkgd.browserRestore = new BrowserRestore(tree.bkgd);
      await boot(tree); // Same browser, new worker; original candidate must survive.
      await reconcile(tree);
      check(tree.nodes['old-0'].tabId === 700, 'Pending recovery survives worker restart');
      await boot(tree);
      await reconcile(tree);
      check(tree.getNodeByTabId(700) === tree.nodes['old-0'], 'Next merge keeps the restored identity');
      await persisted(tree);
      passed.push('worker restarts retain pending recovery and completed bindings');

      tree = await fixture(['https://same.test/', 'https://same.test/']);
      await boot(tree);
      await arrival(tree, windowWith(7, ['https://same.test/', 'https://same.test/']));
      await reconcile(tree);
      check(tree.nodes['old-0'].tabId === 700 && tree.nodes['old-1'].tabId === 701,
        'Two real same-URL tabs retain separate original nodes');
      passed.push('intentional repeated URLs preserve tab multiplicity');

      tree = await fixture(['https://single.test/']);
      await boot(tree);
      await arrival(tree, windowWith(7, ['https://single.test/']));
      await reconcile(tree);
      check(tree.nodes['old-0'].tabId === 700, 'Single-tab restored window is supported');
      passed.push('single-tab window restoration');

      tree = await fixture();
      windows = [windowWith(7, ['https://a.test/'])];
      await boot(tree);
      check(tree.nodes.original.windowId === 7, 'Startup merge attaches partially restored window');
      windows[0].tabs.push(windowWith(7, ['https://a.test/', 'https://b.test/']).tabs[1]);
      await tree.bkgd.onTabCreated(windows[0].tabs[1]);
      await reconcile(tree);
      check(tree.getNodeByTabId(701) === tree.nodes['old-1'], 'Remaining original reconnects');
      passed.push('restoration straddling the initial startup merge');

      for (const variant of ['extra', 'fragment', 'query', 'incognito', 'popup', 'opener']) {
        tree = await fixture();
        await boot(tree);
        const win = windowWith(7, ['https://a.test/', 'https://b.test/']);
        if (variant === 'extra') win.tabs.push({ id: 702, windowId: 7, index: 2, url: 'https://extra.test/' });
        if (variant === 'fragment') win.tabs[1].url += '#different';
        if (variant === 'query') win.tabs[1].url += '?different=1';
        if (variant === 'incognito') win.incognito = true;
        if (variant === 'popup') win.type = 'popup';
        if (variant === 'opener') win.tabs[0].openerTabId = 999;
        await arrival(tree, win);
        await reconcile(tree);
        check(!tree.nodes.original.loaded, `Unrelated ${variant} window must not consume saved entries`);
      }
      passed.push('extra tabs, URL differences, privacy, apps and external openers prevent false matches');

      tree = await fixture();
      const other = await add(tree.root, 'other', { type: 'window', loaded: true, windowId: 2 });
      for (const [i, url] of ['https://a.test/', 'https://b.test/'].entries())
        await add(other, `other-${i}`, { loaded: true, tabId: 20 + i, url });
      await boot(tree);
      await arrival(tree, windowWith(7, ['https://a.test/', 'https://b.test/']));
      await reconcile(tree);
      check(!tree.nodes.original.loaded && !tree.nodes.other.loaded, 'Two identical candidates remain ambiguous');
      passed.push('ambiguous saved windows are left untouched');

      tree = await fixture();
      await boot(tree);
      await arrival(tree, windowWith(7, ['https://a.test/', 'https://b.test/']));
      await arrival(tree, windowWith(8, ['https://a.test/', 'https://b.test/']));
      await reconcile(tree);
      check(!tree.nodes.original.loaded, 'Two live windows cannot claim the same saved window');
      passed.push('ambiguous live windows cannot steal one another\'s tree');

      tree = await fixture();
      const second = await add(tree.root, 'second-window', { type: 'window', loaded: true, windowId: 2 });
      await add(second, 'second-a', { loaded: true, tabId: 20, url: 'https://a.test/' });
      await add(second, 'second-c', { loaded: true, tabId: 21, url: 'https://c.test/' });
      await boot(tree);
      await arrival(tree, windowWith(7, ['https://a.test/', 'https://b.test/']));
      await arrival(tree, windowWith(8, ['https://a.test/', 'https://c.test/']));
      await reconcile(tree);
      check(tree.nodes.original.windowId === 7 && tree.nodes['second-window'].windowId === 8,
        'A shared URL does not mix up two different restored windows');
      passed.push('overlapping windows reconnect separately');

      tree = await fixture();
      const pinned = await tree.nodes.original.addChild(0, { id: 'pinned', label: 'Pinned' },
        { reason: 'testSetup' });
      await tree.nodes['old-0'].moveTo(pinned, 0, { reason: 'testSetup' });
      await boot(tree);
      const pinnedWindow = windowWith(7, ['https://a.test/', 'https://b.test/']);
      pinnedWindow.tabs[0].pinned = true;
      await arrival(tree, pinnedWindow);
      check(tree.getNodeByTabId(700).isPinned(), 'Initial onCreated pin is recorded before reordering');
      await reconcile(tree);
      check(tree.nodes['old-0'].tabId === 700 && tree.nodes['old-0'].isPinned(),
        'Restored pinned tab stays under the original pinned heading');
      await persisted(tree);
      passed.push('pinned tabs reconnect without changing their original position');

      tree = await fixture();
      const existing = await add(tree.root, 'existing', { type: 'window', loaded: true, windowId: 3 });
      await add(existing, 'existing-tab', { loaded: true, tabId: 30, url: 'https://existing.test/' });
      windows = [windowWith(3, ['https://existing.test/'])];
      await boot(tree);
      const newTab = { id: 301, windowId: 3, index: 1, url: 'https://a.test/',
        title: 'New tab', openerTabId: 300 };
      windows[0].tabs.push(newTab);
      await tree.bkgd.onTabCreated(newTab);
      await reconcile(tree);
      check(tree.getNodeByTabId(301)?.getWindowNode() === tree.nodes.existing
        && !tree.nodes['old-0'].loaded, 'An ordinary new tab does not reuse a crashed entry');
      passed.push('ordinary same-URL tabs in an existing window remain new tabs');

      for (const field of ['note', 'checkbox', 'bookmark', 'saved-child']) {
        tree = await fixture();
        await boot(tree);
        await arrival(tree, windowWith(7, ['https://a.test/', 'https://b.test/']));
        const temporary = tree.getNodeByTabId(700);
        if (field === 'saved-child') await add(temporary, 'new-child', { note: 'Keep this too' });
        else temporary[field] = field === 'bookmark' ? true : 'Keep';
        await reconcile(tree);
        check(tree.getNodeByTabId(700) === temporary && !tree.nodes.original.loaded,
          `New ${field} prevents automatic deletion`);
      }
      passed.push('new annotations, tasks, bookmarks and saved children block replacement');

      tree = await fixture();
      await boot(tree);
      await arrival(tree, windowWith(7, ['https://a.test/', 'https://b.test/']));
      const snapshot = () => Object.entries(tree.serializeNodes()).sort(([a], [b]) => a.localeCompare(b));
      const before = JSON.stringify(snapshot());
      const save = tree.db.saveNodes.bind(tree.db);
      tree.db.saveNodes = async () => { throw new Error('Simulated commit failure'); };
      let failed = false;
      try { await reconcile(tree); } catch { failed = true; }
      check(failed && JSON.stringify(snapshot()) === before, 'Failed persistence rolls back memory');
      tree.db.saveNodes = save;
      await reconcile(tree);
      await persisted(tree);
      passed.push('failed commit leaves recovery retryable without losing entries');

      tree = await fixture();
      await boot(tree);
      await arrival(tree, windowWith(7, ['https://a.test/', 'https://b.test/']));
      let releaseEvent;
      const inFlight = tree.bkgd.browserRestore.wrapEvent(() => new Promise(resolve => {
        releaseEvent = resolve;
      }))();
      await reconcile(tree);
      check(!tree.nodes.original.loaded, 'Recovery waits for in-flight browser handlers');
      releaseEvent();
      await inFlight;
      let releaseCommit, reachedCommit;
      const atCommit = new Promise(resolve => { reachedCommit = resolve; });
      const commit = tree.db.saveNodes.bind(tree.db);
      tree.db.saveNodes = async (...args) => {
        reachedCommit();
        await new Promise(resolve => { releaseCommit = resolve; });
        return commit(...args);
      };
      const restoring = reconcile(tree);
      await atCommit;
      let handled = false;
      const duringCommit = tree.bkgd.browserRestore.wrapEvent(() => { handled = true; })();
      await Promise.resolve();
      check(!handled, 'New browser events wait for the atomic reattachment');
      releaseCommit();
      await restoring;
      await duringCommit;
      check(handled && tree.getNodeByTabId(700) === tree.nodes['old-0'],
        'Queued browser events resume against the original nodes');
      passed.push('browser events cannot race the recovery transaction');

      clearTimeout(tree.bkgd.browserRestore.timer);
      return passed;
    });
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log(`PASS (${passed.length} groups): ${passed.join('; ')}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
