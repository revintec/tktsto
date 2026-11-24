// Run with Playwright available: node tests/backup-settings.cjs
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
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
    let source = await fs.readFile(filename);
    if (pathname === '/bkgd/bkgd.js')
      source = source.toString().replace('const bkgd = new Bkgd();\nbkgd.init();', 'export { Bkgd };');
    if (pathname === '/view/sidepanel.html')
      source = source.toString().replace('<script type="module" src="./view.js"></script>', '');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(filename)] || 'application/octet-stream');
    res.end(source);
  } catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.addInitScript(() => {
      window.saved = { clientId: 'pc', theme: 'TK Night', showFavicons: true,
        localBackupInterval: 0, userStyles: '', localBackupLastTimeCompleted: 12345,
        isLatestSnapshotDirty: true, 'TreeView.cursor.old-window': 'old-node' };
      window.storageWrites = [];
      window.messages = [];
      window.downloadListeners = new Set();
      const storageListeners = [];
      window.chrome = {
        storage: {
          onChanged: { addListener: fn => storageListeners.push(fn) },
          local: {
            get: async keys => {
              if (window.failRead) throw new Error('Storage read failed');
              if (typeof keys === 'string') return { [keys]: saved[keys] };
              return Object.fromEntries(Object.entries(keys).map(([key, fallback]) =>
                [key, Object.hasOwn(saved, key) ? saved[key] : fallback]));
            },
            set: async values => {
              if (window.failWrite && !Object.hasOwn(values, 'isLatestSnapshotDirty'))
                throw new Error('Storage write failed');
              storageWrites.push(structuredClone(values));
              const changes = Object.fromEntries(Object.entries(values).map(([key, newValue]) =>
                [key, { oldValue: saved[key], newValue }]));
              Object.assign(saved, values);
              storageListeners.forEach(fn => fn(changes, 'local'));
            }
          }
        },
        runtime: {
          getURL: value => new URL(value, location.origin).href,
          sendMessage: async msg => {
            messages.push(structuredClone(msg));
            return window.background?.[msg.msg]?.(structuredClone(msg)) || {};
          }
        },
        windows: { getCurrent: async (options, callback) => { callback?.({ id: 7 }); return { id: 7 }; } },
        downloads: {
          download: async options => { window.lastDownload = options; return 42; },
          onChanged: { addListener: fn => downloadListeners.add(fn), removeListener: fn => downloadListeners.delete(fn) }
        }
      };
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${url}/options/options.html`);
    await page.waitForFunction(() => document.querySelector('#clientId').value === 'pc');
    await page.evaluate(async () => {
      const { Tree } = await import('/common/tree.js');
      const { NodeStore } = await import('/bkgd/nodestore.js');
      const { IDB } = await import('/bkgd/idb.js');
      const { Bkgd } = await import('/bkgd/bkgd.js');
      window.background = new Bkgd();
      const tree = window.tree = new Tree(NodeStore);
      tree.bkgd = background;
      background.tree = tree;
      background.treeLoaded = Promise.resolve();
      let nextId = 0;
      background.idGen = { newId: () => `import-${++nextId}` };
      tree.db = new IDB();
      tree.db.dbName = 'backup-settings-regression';
      tree.db.init();
      await tree.cfg.init(tree.cfgDefaults);
      tree.resolveTreeLoaded();
      await tree.root.addChild(0, { url: 'https://example.test/', title: 'Saved tab' }, { reason: 'testSetup' });
      storageWrites.length = 0;
      window.originalBackup = await tree.makeBackupObject(tree.root);
    });
    const backup = await page.evaluate(() => originalBackup);
    assert.equal(backup.settings.theme, 'TK Night');
    assert.equal(backup.settings.localBackupInterval, 0);
    assert.equal(backup.settings.treeViewZoomLevel, 0.75, 'Unset preferences export their effective defaults');
    assert.equal(backup.metadata.clientId, backup.settings.clientId);
    for (const key of ['localBackupLastTimeCompleted', 'isLatestSnapshotDirty', 'TreeView.cursor.old-window'])
      assert.ok(!Object.hasOwn(backup.settings, key), `${key} is runtime state, not a portable setting`);

    const readFile = async (data, name = 'settings.json', mimeType = 'application/json') => {
      await page.locator('#tktsto-file-input').setInputFiles({ name, mimeType,
        buffer: Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)) });
      await page.locator('#tktsto-file-button').click();
      await page.waitForFunction(() => !document.querySelector('#tktsto-file-button').disabled);
    };
    const review = async data => {
      await readFile(data);
      assert.ok(await page.locator('#backup-import-preview').isVisible());
    };
    const selection = key => page.locator(`#backup-settings-diff input[data-setting="${key}"]`);
    const importSelected = async () => {
      await page.locator('#backup-import-confirm').click();
      await page.waitForFunction(() => !document.querySelector('#tktsto-file-button').disabled);
    };
    const changed = { ...backup, settings: { ...backup.settings, clientId: 'nb', theme: 'TK Day',
      showFavicons: false, localBackupInterval: 120, userStyles: '/* <img src=x onerror=alert(1)> */\nbody { color: red; }',
      localBackupLastTimeCompleted: 99999, unknownFutureSetting: true, nodesPerPage: -1 } };
    await review(changed);
    assert.equal(await page.locator('#backup-settings-diff tr').count(), 5, 'Only valid changed settings appear');
    assert.equal(await selection('clientId').isChecked(), false, 'Browser identity is opt-in');
    assert.equal(await page.locator('#backup-settings-diff img').count(), 0, 'Imported values are rendered as text');
    assert.match(await page.locator('#backup-settings-ignored').textContent(), /unknownFutureSetting/);
    assert.equal(await page.evaluate(() => messages.filter(m => m.msg === 'bkgd_importBackupFile').length), 0,
      'Preview makes no import call');
    if (process.env.SCREENSHOT_DIR) {
      await fs.mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
      for (const theme of ['tk-night', 'tk-day']) {
        await page.locator('#theme-variant').evaluate((el, theme) => { el.href = `/themes/${theme}.css`; }, theme);
        await page.waitForFunction(theme => Array.from(document.styleSheets).some(sheet => sheet.href?.endsWith(`${theme}.css`)), theme);
        await page.locator('#backup-import-preview').screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${theme}-settings-diff.png`) });
      }
      await page.setViewportSize({ width: 460, height: 900 });
      await page.locator('#backup-import-preview').screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'narrow-settings-diff.png') });
      await page.setViewportSize({ width: 1200, height: 900 });
    }
    await page.locator('#backup-import-cancel').click();
    assert.equal(await page.evaluate(() => storageWrites.length), 0, 'Cancel leaves storage unchanged');

    await review(changed);
    await page.locator('#backup-select-none').click();
    await page.locator('#backup-import-session').uncheck();
    assert.ok(await page.locator('#backup-import-confirm').isDisabled());
    await selection('theme').check();
    await selection('showFavicons').check();
    await importSelected();
    assert.equal(await page.locator('#backup-import-preview').isVisible(), false);
    assert.match(await page.locator('#backup-import-status').textContent(), /0 nodes and 2 settings imported/);
    assert.deepEqual(await page.evaluate(() => storageWrites), [{ theme: 'TK Day', showFavicons: false }]);
    assert.equal(await page.locator('#theme').inputValue(), 'TK Day');
    assert.equal(await page.locator('#showFavicons').isChecked(), false);
    assert.equal(await page.evaluate(() => Object.keys(tree.nodes).length), 2, 'Settings-only import leaves the tree alone');
    assert.equal(await page.evaluate(() => saved.clientId), 'pc');

    // Select-all, false/zero/empty values, and client ID opt-in.
    await page.evaluate(() => chrome.storage.local.set({ localBackupInterval: 60, fontFamily: 'Arial' }));
    await review({ ...backup, settings: { clientId: 'nb', theme: 'TK Night', showFavicons: true,
      localBackupInterval: 0, fontFamily: '' } });
    await page.locator('#backup-select-all').click();
    await page.locator('#backup-import-session').uncheck();
    await importSelected();
    assert.equal(await page.evaluate(() => saved.clientId), 'nb');
    assert.equal(await page.locator('#localBackupHours').inputValue(), '0');
    assert.equal(await page.locator('#fontFamily').inputValue(), '');

    // Older backups still add their session and never overwrite preferences.
    const legacy = { ...backup };
    delete legacy.settings;
    await review(legacy);
    assert.match(await page.locator('#backup-settings-summary').textContent(), /older backup has no settings/);
    await importSelected();
    assert.equal(await page.evaluate(() => Object.keys(tree.nodes).length), 4);
    assert.equal(await page.evaluate(() => saved.clientId), 'nb');
    await review({ ...backup, settings: { theme: 'TK Night' } });
    assert.match(await page.locator('#backup-settings-summary').textContent(), /No settings changes/);
    await page.locator('#backup-import-cancel').click();

    await readFile('{bad JSON');
    assert.match(await page.locator('#backup-import-status').textContent(), /Could not import/);
    assert.equal(await page.locator('#backup-import-preview').isVisible(), false);
    await readFile({ settings: {} });
    assert.match(await page.locator('#backup-import-status').textContent(), /not a valid TKTSTO backup/);
    await readFile({ ...backup, settings: [] });
    assert.match(await page.locator('#backup-import-status').textContent(), /settings must be a JSON object/);
    await readFile(legacy, 'legacy.json', '');
    assert.ok(await page.locator('#backup-import-preview').isVisible(), 'JSON with an empty MIME type is accepted');
    await page.locator('#tktsto-file-input').setInputFiles([]);
    assert.equal(await page.locator('#backup-import-preview').isVisible(), false, 'Changing files clears stale selections');

    // A text edit still waiting to auto-save must be reflected in the diff,
    // and must not overwrite the value after it has been imported.
    await page.locator('#fontFamily').fill('Georgia');
    await review({ ...backup, settings: { fontFamily: 'Verdana' } });
    assert.equal(await page.locator('#backup-settings-diff .setting-current').textContent(), 'Georgia');
    await page.locator('#backup-import-session').uncheck();
    await importSelected();
    assert.equal(await page.locator('#fontFamily').inputValue(), 'Verdana');
    assert.equal(await page.locator('#fontFamily').evaluate(el => el.classList.contains('unsaved')), false);

    // Validate again in the background, before any tree mutations or writes.
    const rejected = await page.evaluate(async backup => {
      const before = Object.keys(tree.nodes).length;
      const response = await background.bkgd_importBackupFile({ data: { ...backup,
        settings: { localBackupLastTimeCompleted: 0 } }, settingsKeys: ['localBackupLastTimeCompleted'] });
      return { response, before, after: Object.keys(tree.nodes).length };
    }, backup);
    assert.match(rejected.response.error, /Invalid setting/);
    assert.equal(rejected.before, rejected.after);

    // Failed writes show an error, retain the review, and allow a settings retry.
    await review({ ...backup, settings: { theme: 'TK Day' } });
    await page.evaluate(() => { window.failWrite = true; });
    await importSelected();
    assert.match(await page.locator('#backup-import-status').textContent(), /1 nodes imported.*Storage write failed/);
    assert.equal(await page.locator('#backup-import-session').isChecked(), false);
    await page.evaluate(() => { window.failWrite = false; });
    await importSelected();
    assert.match(await page.locator('#backup-import-status').textContent(), /0 nodes and 1 settings imported/);

    // Exercise actual download payloads from both the service worker and a view.
    const downloads = await page.evaluate(async () => {
      const completedBefore = saved.localBackupLastTimeCompleted;
      await tree.downloadBackupNow();
      const workerBackup = await (await fetch(lastDownload.url)).json();
      downloadListeners.forEach(fn => fn({ id: 42, state: { current: 'interrupted' } }));
      const afterFailure = saved.localBackupLastTimeCompleted;
      tree.bkgd = null;
      await tree.downloadBackupNow();
      const viewBackup = await (await fetch(lastDownload.url)).json();
      downloadListeners.forEach(fn => fn({ id: 42, state: { current: 'complete' } }));
      await new Promise(resolve => setTimeout(resolve, 0));
      window.failRead = true;
      let readFailed = false;
      try { await tree.downloadBackupNow(); } catch { readFailed = true; }
      window.failRead = false;
      return { workerBackup, viewBackup, completedBefore, afterFailure,
        afterSuccess: saved.localBackupLastTimeCompleted, readFailed, locked: tree.localBackupInProgress };
    });
    assert.equal(downloads.workerBackup.settings.theme, 'TK Day');
    assert.deepEqual(downloads.workerBackup.settings, downloads.viewBackup.settings);
    assert.equal(downloads.afterFailure, downloads.completedBefore);
    assert.ok(downloads.afterSuccess > downloads.afterFailure);
    assert.ok(downloads.readFailed && !downloads.locked, 'A storage-read failure does not prevent the next backup');

    // Badge stays positioned at narrow widths/zoom, updates as time passes,
    // and reacts to completed-backup storage notifications from another view.
    await page.goto(`${url}/view/sidepanel.html`);
    await page.clock.install({ time: new Date('2026-11-24T10:00:00Z') });
    await page.evaluate(async () => {
      const { TreeView } = await import('/view/treeview.js');
      window.view = new TreeView();
      await view.cfg.init(view.cfgDefaults);
      view.initElements();
      view.initBackupBadge();
      await chrome.storage.local.set({ localBackupLastTimeCompleted: 0 });
    });
    assert.equal(await page.locator('#backup-age').textContent(), 'Never');
    await page.evaluate(() => chrome.storage.local.set({ localBackupLastTimeCompleted: Date.now() - 2.99 * 3600000 }));
    assert.equal(await page.locator('#backup-age').textContent(), '2');
    await page.clock.fastForward(60000);
    assert.equal(await page.locator('#backup-age').textContent(), '3');
    await page.evaluate(() => chrome.storage.local.set({ localBackupLastTimeCompleted: Date.now() }));
    assert.equal(await page.locator('#backup-age').textContent(), '0');
    await page.evaluate(() => chrome.storage.local.set({ localBackupLastTimeCompleted: Date.now() + 3600000 }));
    assert.equal(await page.locator('#backup-age').textContent(), '0', 'Clock skew never produces negative hours');
    await page.clock.resume();
    for (const theme of ['tk-night', 'tk-day']) {
      await page.locator('#theme-variant').evaluate((el, theme) => { el.href = `/themes/${theme}.css`; }, theme);
      await page.waitForFunction(theme => Array.from(document.styleSheets).some(sheet => sheet.href?.endsWith(`${theme}.css`)), theme);
      await page.setViewportSize({ width: 260, height: 640 });
      for (const zoom of [0.75, 1, 1.5]) {
        await page.evaluate(async zoom => {
          document.documentElement.style.zoom = zoom;
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
        }, zoom);
        const button = await page.locator('#backup-btn').boundingBox();
        const badge = await page.locator('#backup-age').boundingBox();
        assert.ok(Math.abs(badge.x + badge.width - button.x - button.width) < 1,
          'Backup badge stays at the right edge across toolbar widths and zoom levels');
        assert.ok(badge.y < button.y && badge.y + badge.height > button.y, 'Badge stays at the button corner');
      }
      if (process.env.SCREENSHOT_DIR) {
        await fs.mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${theme}-backup-badge.png`) });
      }
    }
    await page.evaluate(() => { document.body.classList.add('pointer-away'); });
    assert.equal(await page.locator('#backup-age').evaluate(el => getComputedStyle(el).filter), 'none');
    await page.evaluate(() => { view.destroy(); });
    const textAtDestroy = await page.locator('#backup-age').textContent();
    await page.clock.fastForward(3 * 3600000);
    assert.equal(await page.locator('#backup-age').textContent(), textAtDestroy, 'Destroy clears the refresh timer');
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log('PASS: settings export from worker and view; selective and legacy imports; validation/cancel/errors; backup age refresh and completion tracking');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
