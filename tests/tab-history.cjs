// Run with Playwright available: node tests/tab-history.cjs
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
    if (pathname === '/') return res.end('<!doctype html><title>Tab history regressions</title>');
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
      let panels = [], windows = [];
      window.chrome = {
        runtime: { getURL: value => new URL(value, location.origin).href,
          sendMessage: async message => {
            await Promise.all(panels.map(panel => panel[message.msg]?.(structuredClone(message))));
            return {};
          } },
        storage: { local: { get: async defaults => ({ ...defaults }), set: async () => {} },
          session: { get: async () => ({}), set: async () => {} } },
        windows: { get: async id => ({ id, type: 'normal' }), getAll: async () => windows },
        tabs: { remove: async () => {}, query: async () => [{ id: 70, windowId: 7 }] }
      };
      const { Tree } = await import('/common/tree.js');
      const { mergeTabHistories } = await import('/common/node.js');
      const { NodeStore } = await import('/bkgd/nodestore.js');
      const { TreeStore } = await import('/bkgd/treestore.js');
      const { IDB } = await import('/bkgd/idb.js');
      const { Bkgd } = await import('/bkgd/bkgd.js');
      class TestNode extends NodeStore {
        async reorderAllTabsInThisWindow () {}
        updateOpenerTabId () {}
        async setActiveTab () {}
      }
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      const clone = tree => {
        const panel = new Tree();
        panel.rebuildNodeFromSerializedHash(panel.root, structuredClone(tree.serializeNodes()));
        panel.resolveTreeLoaded();
        return panel;
      };
      const tree = new Tree(TestNode);
      const bkgd = new Bkgd();
      let sequence = 0;
      tree.bkgd = bkgd; bkgd.tree = tree;
      bkgd.idGen = { newId: () => `history-${++sequence}` };
      bkgd.treeLoaded = Promise.resolve();
      tree.resolveTreeLoaded();
      tree.db = new IDB();
      tree.db.dbName = 'tab-history-regression';
      tree.db.init();
      const add = (parent, fields) => parent.addChild(parent.nodes.length, fields,
        { reason: 'testSetup' });
      const win = await add(tree.root, { id: 'win', type: 'window', windowId: 7, loaded: true });
      const tab = await add(win, { id: 'tab', tabId: 70, windowId: 7, loaded: true,
        url: 'https://a.test/' });
      panels = [clone(tree), clone(tree)];
      const change = (fields, when) => tab.setTabFields(fields, { reason: 'onTabUpdated', when });
      const passed = [];

      await change({ title: 'Page A' }, 1000);
      check(!tab.tabHistory, 'First title arrival does not invent a previous page');
      await change({ url: 'https://b.test/', title: 'Page B' }, 2000);
      check(tab.tabHistory.length === 1 && tab.tabHistory[0].url === 'https://a.test/'
        && tab.tabHistory[0].title === 'Page A' && tab.tabHistory[0].changedAt === 2000
        && tab.tabHistory[0].kind === 'url',
        'Navigation captures the previous URL and title together');
      check(panels.every(p => JSON.stringify(p.nodes.tab.tabHistory) === JSON.stringify(tab.tabHistory)),
        'Every view receives identical history without recording another copy');
      passed.push('navigation records paired URL/title history and synchronizes views');

      await change({ title: 'Renamed B' }, 3000);
      check(tab.tabHistory[0].url === 'https://b.test/' && tab.tabHistory[0].title === 'Page B'
        && tab.tabHistory[0].kind === 'title',
        'Title-only changes retain the old title for the same URL');
      const historyBeforeStatus = JSON.stringify(tab.tabHistory);
      await change({ title: 'Renamed B', url: 'https://b.test/', discarded: true }, 3500);
      await tree.onTabUpdated(70, { discarded: false }, { id: 70, windowId: 7 });
      check(tab.url === 'https://b.test/' && tab.title === 'Renamed B',
        'Partial browser events keep the known URL and title');
      check(JSON.stringify(tab.tabHistory) === historyBeforeStatus,
        'Status-only, repeated and missing-field updates add no history');
      passed.push('title changes are kept; repeated and partial events add no noise');

      const savedSnapshot = tab.toDict();
      const savedHistory = JSON.stringify(savedSnapshot.tabHistory);
      await change({ url: 'https://a.test/', title: 'Page A' }, 4000);
      await change({ url: 'https://b.test/', title: 'Renamed B' }, 5000);
      check(tab.tabHistory.filter(e => e.url === 'https://a.test/' && e.title === 'Page A').length === 1,
        'Revisiting a previous page does not duplicate the pair');
      check(tab.tabHistory[0].url === 'https://a.test/' && tab.tabHistory[0].changedAt === 5000,
        'A repeated pair moves to its newest replacement time');
      check(JSON.stringify(savedSnapshot.tabHistory) === savedHistory,
        'Later changes do not mutate backup or undo history snapshots');
      passed.push('distinct pairs are newest first and older snapshots remain immutable');

      const records = await tree.db.loadAllNodes();
      const reloaded = new Tree();
      reloaded.rebuildNodeFromSerializedHash(reloaded.root, records);
      check(JSON.stringify(reloaded.nodes.tab.tabHistory) === JSON.stringify(tab.tabHistory),
        'History survives real IndexedDB storage and tree reconstruction');
      const backup = await tree.makeBackupObject(tree.root, new Date());
      const imported = await bkgd.importBackupFile(structuredClone(backup), 'history.json');
      check(imported > 0, 'Backup imports successfully');
      const importedTab = Object.values(tree.nodes).find(n => n !== tab && n.url === tab.url);
      check(JSON.stringify(importedTab.tabHistory) === JSON.stringify(tab.tabHistory),
        'History survives backup export/import with new node IDs');
      passed.push('history persists through database reload and backup round-trip');

      windows = [{ id: 7, type: 'normal', tabs: [{
        id: 70, windowId: 7, url: 'https://c.test/', title: 'Page C', active: true
      }] }];
      bkgd.detectSameBrowserSession = async () => true;
      await bkgd.mergeOpenWindowsIntoTree();
      check(tree.getNodeByTabId(70) === tab && tab.url === 'https://c.test/',
        'Worker wakeup attaches the existing tab by ID');
      check(tab.tabHistory[0].url === 'https://b.test/' && tab.tabHistory[0].title === 'Renamed B',
        'A navigation discovered while merging remembers the previously saved page');
      passed.push('worker wakeup records navigation missed while asleep');

      // Manual edits originate in a view. The background must save the history
      // that view sends rather than adding a second entry of its own.
      const beforeEdit = tab.tabHistory.length;
      await panels[0].nodes.tab.setTabFields({ title: 'Edited C' },
        { reason: 'userAction', when: Date.now() + 1 });
      await tree.tree_nodeChanged({ nodeId: tab.id, type: 'setTabFields',
        changes: { title: panels[0].nodes.tab.title, tabHistory: panels[0].nodes.tab.tabHistory },
        when: Date.now() + 1 });
      check(tab.tabHistory.length === beforeEdit + 1
        && tab.tabHistory[0].title === 'Page C', 'User edits add one shared history entry');
      check(JSON.stringify((await tree.db.loadNode(tab.id)).tabHistory) === JSON.stringify(tab.tabHistory),
        'View-originated history is persisted');
      passed.push('manual edits preserve a single authoritative history');

      const beforeUnload = JSON.stringify(tab.tabHistory);
      await tab.unload({ reason: 'userAction' });
      check(JSON.stringify(tab.tabHistory) === beforeUnload, 'Unloading retains history');
      await tab.setTabFields({ tabId: 71, loaded: true }, { reason: 'onTabCreated' });
      check(JSON.stringify(tab.tabHistory) === beforeUnload, 'Reattaching the same page adds no history');
      clearTimeout(bkgd.browserRestore.timer);
      passed.push('unload and reattach retain history without spurious entries');

      const limited = await add(win, { id: 'limited',
        url: 'https://limits.test/0', title: 'Page 0' });
      panels = [clone(tree), clone(tree)];
      const update = (fields, when) => limited.setTabFields(fields, { reason: 'onTabUpdated', when });
      const byKind = kind => limited.tabHistory.filter(e => e.kind === kind);
      for (let i = 1; i <= 12; i++)
        await update({ url: `https://limits.test/${i}`, title: `Page ${i}` }, 100000 + i);
      check(limited.tabHistory.length === 8 && byKind('url').length === 8,
        'Navigation changing both fields consumes only the URL quota');
      check(byKind('url').map(e => e.url).join(',') ===
        Array.from({ length: 8 }, (_, i) => `https://limits.test/${11 - i}`).join(','),
        'Exactly the eight newest navigations survive');
      const urlsBeforeTicks = JSON.stringify(byKind('url'));
      for (let i = 1; i <= 12; i++) await update({ title: `Price ${i}` }, 200000 + i);
      check(limited.tabHistory.length === 16 && byKind('title').length === 8,
        'History holds eight titles and eight URLs');
      check(byKind('title').map(e => e.title).join(',') ===
        Array.from({ length: 8 }, (_, i) => `Price ${11 - i}`).join(','),
        'The oldest price ticks are discarded');
      check(JSON.stringify(byKind('url')) === urlsBeforeTicks,
        'A flood of title changes cannot evict any URL records');
      const titlesBeforeNavigation = JSON.stringify(byKind('title'));
      for (let i = 13; i <= 24; i++)
        await update({ url: `https://limits.test/${i}`, title: `Page ${i}` }, 300000 + i);
      check(limited.tabHistory.length === 16 && byKind('url').length === 8
        && JSON.stringify(byKind('title')) === titlesBeforeNavigation,
        'A flood of navigation changes cannot evict title records');
      check(panels.every(p => JSON.stringify(p.nodes.limited.tabHistory) ===
        JSON.stringify(limited.tabHistory)), 'Views share the same bounded history');
      check(JSON.stringify((await tree.db.loadNode(limited.id)).tabHistory) ===
        JSON.stringify(limited.tabHistory), 'Storage contains the bounded history');
      passed.push('independent eight-record quotas protect URL history from price ticks and vice versa');

      const historyBatch = offset => ['title', 'url'].flatMap(kind =>
        Array.from({ length: 8 }, (_, i) => ({ kind, url: `https://merge.test/${i + offset}`,
          title: `Version ${i + offset}`, changedAt: i + offset })));
      const originalHistory = historyBatch(0), temporaryHistory = historyBatch(8);
      const originalSnapshot = JSON.stringify(originalHistory);
      const merged = mergeTabHistories(originalHistory, temporaryHistory,
        [temporaryHistory[0]]);
      check(merged.length === 16 && merged.every(e => e.changedAt >= 8),
        'Merging restored histories deduplicates each kind and retains its newest eight');
      check(JSON.stringify(originalHistory) === originalSnapshot,
        'Trimming a merged history does not mutate the original snapshot');
      passed.push('restoration merges enforce both limits without mutating snapshots');

      // Simulate an old database written before change kinds and caps existed.
      const legacyTitles = Array.from({ length: 12 }, (_, i) => ({
        url: 'https://legacy.test/current', title: `Tick ${11 - i}`, changedAt: 200 - i }));
      const legacyUrls = Array.from({ length: 12 }, (_, i) => ({
        url: `https://legacy.test/${11 - i}`, title: `Older ${11 - i}`, changedAt: 100 - i }));
      const legacy = [...legacyTitles, ...legacyUrls];
      const legacySnapshot = JSON.stringify(legacy);
      const raw = limited.toDict();
      raw.url = 'https://legacy.test/current'; raw.title = 'Tick 12'; raw.tabHistory = legacy;
      await tree.db.saveNodes([{ id: raw.id, toDict: () => raw }]);
      tree.reattachOrphanedNodes = TreeStore.prototype.reattachOrphanedNodes;
      await TreeStore.prototype.loadTreeFromDB.call(tree);
      const migrated = tree.nodes.limited.tabHistory;
      check(migrated.length === 16 && migrated.filter(e => e.kind === 'title').length === 8
        && migrated.filter(e => e.kind === 'url').length === 8,
        'Loading old history infers title-only versus URL changes before trimming');
      check(migrated.filter(e => e.kind === 'title').at(-1).title === 'Tick 4'
        && migrated.filter(e => e.kind === 'url').at(-1).url === 'https://legacy.test/4',
        'Migration keeps the most recent eight records in each category');
      check(JSON.stringify((await tree.db.loadNode('limited')).tabHistory) === JSON.stringify(migrated),
        'Startup persists the trimmed legacy history immediately');
      check(JSON.stringify(legacy) === legacySnapshot, 'Migration does not mutate the old backup');
      passed.push('old database histories are classified, trimmed and persisted during startup');

      panels = [];
      const legacyBackup = await tree.makeBackupObject(tree.root, new Date());
      legacyBackup.nodes.limited.tabHistory = legacy;
      await bkgd.importBackupFile(structuredClone(legacyBackup), 'old-history.json');
      const importedLegacy = Object.values(tree.nodes).find(n => n.id !== 'limited'
        && n.url === raw.url);
      check(JSON.stringify(importedLegacy.tabHistory) === JSON.stringify(migrated),
        'Importing a legacy backup applies the same independent limits');
      check(JSON.stringify((await tree.db.loadNode(importedLegacy.id)).tabHistory) ===
        JSON.stringify(migrated), 'Imports save the trimmed history');
      await tree.nodes.limited.setTabFields({ tabHistory: legacy }, { reason: 'tree_nodeChanged' });
      check(JSON.stringify(tree.nodes.limited.tabHistory) === JSON.stringify(migrated),
        'Incoming history notifications cannot bypass the limits');
      passed.push('backup imports and incoming view history obey both limits');
      return passed;
    });
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log(`PASS (${passed.length} groups): ${passed.join('; ')}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
