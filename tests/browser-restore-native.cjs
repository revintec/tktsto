// Run with Playwright available: node tests/browser-restore-native.cjs
// TEST_CHROME_PATH may point to Chrome for Testing with extension loading enabled.
// Native Chrome session-restore smoke test in a disposable profile.
// Adds "sessions" permission only to a temporary copy used by this test.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'tktsto-native-restore-'));
  const extension = path.join(temp, 'extension');
  const server = http.createServer((req, res) => {
    const title = req.url === '/next' ? 'Navigated page' : 'Restore test';
    res.end(`<!doctype html><title>${title}</title>${title}`);
  });
  let context;
  try {
    await fs.cp(root, extension, { recursive: true });
    const manifestPath = path.join(extension, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    manifest.permissions.push('sessions');
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const urls = ['a', 'b'].map(p => `http://127.0.0.1:${server.address().port}/${p}`);
    context = await chromium.launchPersistentContext(path.join(temp, 'profile'), {
      channel: 'chromium', headless: true,
      executablePath: process.env.TEST_CHROME_PATH,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await page.evaluate(() => chrome.runtime.sendMessage({ msg: 'bkgd_getTree' }));
    const winId = await page.evaluate(async urls => {
      const win = await chrome.windows.create({ url: urls, focused: false });
      return win.id;
    }, urls);
    await new Promise(resolve => setTimeout(resolve, 600));
    await page.evaluate(async ({ id, urls }) => {
      const tabs = await chrome.tabs.query({ windowId: id });
      await chrome.tabs.update(tabs.find(t => t.url === urls[0]).id, { pinned: true });
    }, { id: winId, urls });
    await new Promise(resolve => setTimeout(resolve, 400));
    await page.evaluate(async ({ id, urls }) => {
      const tabs = await chrome.tabs.query({ windowId: id });
      await chrome.tabs.update(tabs.find(t => t.url === urls[1]).id, { pinned: false });
    }, { id: winId, urls });
    await new Promise(resolve => setTimeout(resolve, 400));
    await page.evaluate(id => chrome.windows.remove(id), winId);
    await new Promise(resolve => setTimeout(resolve, 700));
    const sessionId = await page.evaluate(async urls => {
      const entries = await chrome.sessions.getRecentlyClosed();
      return entries.find(e => e.window?.tabs?.some(t => t.url === urls[0]))?.window?.sessionId;
    }, urls);
    assert.ok(sessionId, 'Chrome recorded the closed window');
    console.log('Native session recorded');
    // Mimic the database left by a crash: original IDs/hierarchy and stale
    // loaded flags, with only the initial blank/options window currently open.
    await page.evaluate(async urls => {
      const common = { expanded: true, loaded: false, wasLoaded: false, active: false,
        marked: false, nodes: [], ctime: Date.now(), mtime: Date.now(), atime: Date.now() };
      const records = [
        { ...common, id: 'root', parent: 'root', nodes: ['original'], label: 'Session' },
        { ...common, id: 'original', parent: 'root', type: 'window', nodes: ['pinned', 'old-b'],
          loaded: true, windowId: 990, label: 'Research', note: 'Window notes' },
        { ...common, id: 'pinned', parent: 'original', label: 'Pinned', nodes: ['old-a'] },
        { ...common, id: 'old-a', parent: 'pinned', loaded: true, tabId: 991,
          windowId: 990, url: urls[0], title: 'A', note: 'Original note', nodes: ['saved'],
          tabHistory: [{ url: 'https://earlier.test/', title: 'Earlier page', changedAt: 1000 }] },
        { ...common, id: 'old-b', parent: 'original', loaded: true, tabId: 992,
          windowId: 990, url: urls[1], title: 'B' },
        { ...common, id: 'saved', parent: 'old-a', url: 'https://saved.test/', note: 'Saved child' }
      ];
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('TKTSTO');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const txn = db.transaction('Nodes', 'readwrite');
        const store = txn.objectStore('Nodes');
        store.clear();
        for (const record of records) store.put({ key: record.id, data: JSON.stringify(record) });
        txn.oncomplete = resolve; txn.onabort = () => reject(txn.error);
      });
      db.close();
      await chrome.storage.session.clear();
    }, urls);
    const cdp = await context.newCDPSession(page);
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');
    await page.evaluate(() => chrome.runtime.sendMessage({ msg: 'bkgd_getTree' }));
    const before = await page.evaluate(() => chrome.runtime.sendMessage({ msg: 'bkgd_getTree' }));
    assert.equal(before.nodes['old-a'].loaded, false);
    assert.equal(before.nodes['old-a'].wasLoaded, true);
    console.log('Extension restarted against simulated crash database');
    const restored = await page.evaluate(id => chrome.sessions.restore(id), sessionId);
    assert.deepEqual(restored.window.tabs.map(t => t.pinned), [true, false],
      'Native session restores the mixed pinned/unpinned fixture');
    let ready = false;
    for (let i = 0; i < 60; i++) {
      ready = await page.evaluate(async () => {
        const state = await chrome.runtime.sendMessage({ msg: 'bkgd_getTree' });
        return !!state.nodes['old-a'].loaded && !!state.nodes['old-b'].loaded;
      });
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready) console.log(JSON.stringify(await page.evaluate(async () => ({
      tree: await chrome.runtime.sendMessage({ msg: 'bkgd_getTree' }),
      state: await chrome.storage.session.get('pendingBrowserRestore'),
      windows: await chrome.windows.getAll({ populate: true })
    })), null, 2));
    assert.ok(ready, 'Original nodes reconnect after native restore');
    const state = await page.evaluate(() => chrome.runtime.sendMessage({ msg: 'bkgd_getTree' }));
    const tabs = await page.evaluate(id => chrome.tabs.query({ windowId: id }), restored.window.id);
    if (state.nodes.original.windowId !== restored.window.id) console.log(JSON.stringify({ restored, state, tabs }, null, 2));
    assert.equal(state.nodes.original.windowId, restored.window.id);
    assert.equal(state.nodes['old-a'].tabId, tabs.find(t => t.url === urls[0]).id);
    assert.equal(state.nodes['old-b'].tabId, tabs.find(t => t.url === urls[1]).id);
    assert.equal(tabs.find(t => t.url === urls[0]).pinned, true);
    assert.equal(state.nodes['old-a'].note, 'Original note');
    assert.equal(state.nodes.saved.parent, 'old-a');
    assert.equal(Object.values(state.nodes).filter(n => urls.includes(n.url)).length, 2);
    assert.ok(state.nodes['old-a'].tabHistory.some(e => e.url === 'https://earlier.test/'
      && e.title === 'Earlier page'), 'Native restoration retains the original tab history');
    assert.ok(state.nodes['old-a'].tabHistory.some(e => e.url === urls[0] && e.title === 'A'),
      'Restoration remembers the original saved title when the live title differs');

    // Real Chrome navigation and title events must extend that same history.
    const nextUrl = new URL('/next', urls[0]).href;
    await page.evaluate(({ tabId, url }) => chrome.tabs.update(tabId, { url }),
      { tabId: state.nodes['old-a'].tabId, url: nextUrl });
    await page.waitForFunction(async url => {
      const { nodes } = await chrome.runtime.sendMessage({ msg: 'bkgd_getTree' });
      return nodes['old-a'].url === url && nodes['old-a'].title === 'Navigated page';
    }, nextUrl);
    const livePage = context.pages().find(p => p.url() === nextUrl);
    assert.ok(livePage, 'The original restored browser tab navigated');
    await livePage.waitForLoadState();
    await livePage.evaluate(() => { document.title = 'Renamed live page'; });
    await page.waitForFunction(async () => {
      const { nodes } = await chrome.runtime.sendMessage({ msg: 'bkgd_getTree' });
      return nodes['old-a'].title === 'Renamed live page';
    });
    const changed = await page.evaluate(() => chrome.runtime.sendMessage({ msg: 'bkgd_getTree' }));
    const history = changed.nodes['old-a'].tabHistory;
    assert.ok(history.some(e => e.url === urls[0] && e.title === 'Restore test'),
      'A real navigation retains the preceding URL/title pair');
    assert.ok(history.some(e => e.url === nextUrl && e.title === 'Navigated page'),
      'A real title-only event retains the preceding title');
    assert.equal(changed.nodes['old-a'].tabId, state.nodes['old-a'].tabId);
    console.log('PASS: native Chrome sessions.restore retained original IDs, pinned tab, notes, history and saved child without duplicates; real navigation and title updates extend history');
  } finally {
    await context?.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
