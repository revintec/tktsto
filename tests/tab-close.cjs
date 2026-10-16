// Run with Playwright available: node tests/tab-close.cjs
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
    if (pathname === '/') return res.end('<!doctype html><title>Tab close regression tests</title>');
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
    res.setHeader('Content-Type', 'text/javascript');
    res.end(await fs.readFile(filename));
  } catch {
    res.writeHead(404).end();
  }
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
      let panels = [];
      window.chrome = {
        runtime: {
          getURL: value => new URL(value, location.origin).href,
          sendMessage: async message => {
            // Each connected sidepanel receives the same tree mutation.
            await Promise.all(panels.map(panel =>
              panel[message.msg]?.(structuredClone(message))));
            return {};
          }
        },
        tabs: { remove: async () => {} }
      };
      const { Tree } = await import('/common/tree.js');
      const { NodeStore } = await import('/bkgd/nodestore.js');
      const check = (condition, message) => {
        if (!condition) throw new Error(message);
      };
      const clonePanel = tree => {
        const panel = new Tree();
        panel.rebuildNodeFromSerializedHash(panel.root, structuredClone(tree.serializeNodes()));
        panel.resolveTreeLoaded();
        return panel;
      };
      const fixture = async (fields = {}) => {
        panels = [];
        const tree = new Tree(NodeStore);
        const records = new Map();
        tree.db = {
          saveNode: async node => records.set(node.id, structuredClone(node.toDict())),
          deleteNode: async id => records.delete(id)
        };
        tree.resolveTreeLoaded();
        const add = (parent, details) => parent.addChild(parent.nodes.length, details, { reason: 'testSetup' });
        for (const windowId of [7, 8]) {
          const win = await add(tree.root,
            { id: `win${windowId}`, type: 'window', windowId, loaded: true });
          await add(win, { id: `keep${windowId}`, tabId: windowId * 100,
            windowId, url: `https://keep${windowId}.test`, loaded: true });
          await add(win, { id: `closed${windowId}`, tabId: windowId * 100 + 1,
            windowId, url: `https://closed${windowId}.test`, loaded: true, ...fields });
        }
        panels.push(clonePanel(tree), clonePanel(tree));
        return { tree, records };
      };
      const merge = async (tree, trustTabIds = true) => {
        const claimedWindows = new Set(), claimedTabs = new Set();
        for (const windowId of [7, 8]) {
          const match = tree.findMatchingWindow({ id: windowId, tabs: [
            { id: windowId * 100, windowId, url: `https://keep${windowId}.test` }
          ] }, claimedWindows, claimedTabs, { trustTabIds });
          check(match.winNode?.id === `win${windowId}`, 'The surviving tabs retain their window nodes');
          claimedWindows.add(match.winNode);
          for (const node of match.loadedTabNodesWithNoTab) await tree.db.saveNode(node);
        }
      };
      const close = (tree, windowId, isWindowClosing = false) =>
        tree.onTabRemoved(windowId * 100 + 1, { windowId, isWindowClosing });
      const checkRemoved = ({ tree, records }, id) => {
        check(!tree.nodes[id] && !records.has(id), `${id} is removed from the worker and storage`);
        check(panels.every(panel => !panel.nodes[id]), `${id} is removed from every sidepanel`);
      };
      const passed = [];

      let state = await fixture();
      await close(state.tree, 7);
      checkRemoved(state, 'closed7');
      passed.push('ordinary close while the worker is awake');

      state = await fixture();
      // Startup reconciliation runs before the queued onRemoved handlers.
      await merge(state.tree);
      // One panel was already open; another connects after reconciliation.
      panels[1] = clonePanel(state.tree);
      for (const windowId of [7, 8]) {
        await close(state.tree, windowId);
        checkRemoved(state, `closed${windowId}`);
        check(state.tree.nodes[`keep${windowId}`].loaded, 'Surviving tabs remain loaded');
      }
      passed.push('queued closes after restart, with two windows and two sidepanels');

      state = await fixture({ note: 'Keep this annotation' });
      await merge(state.tree);
      await close(state.tree, 7);
      for (const tree of [state.tree, ...panels]) {
        const node = tree.nodes.closed7;
        check(node?.note === 'Keep this annotation' && !node.loaded && !node.wasLoaded,
          'An individually closed annotated tab keeps its note without remaining pink');
      }
      check(!state.records.get('closed7').wasLoaded, 'The closed annotated state is persisted');
      passed.push('annotated tab closure after restart');

      state = await fixture();
      await state.tree.nodes.closed7.unload({ reason: 'mergeOpenWindowsIntoTree' });
      await close(state.tree, 7);
      checkRemoved(state, 'closed7');
      passed.push('recovery unload is not mistaken for an explicit user unload');

      state = await fixture();
      await state.tree.nodes.closed7.unload({ reason: 'userAction' });
      await close(state.tree, 7);
      check(!!state.tree.nodes.closed7 && !state.tree.nodes.closed7.wasLoaded,
        'Explicitly unloading a tab still preserves its saved node');
      passed.push('explicit unload retains its node');

      state = await fixture();
      await state.tree.nodes.win7.unload({ reason: 'mergeOpenWindowsIntoTree' });
      await close(state.tree, 7, true);
      for (const tree of [state.tree, ...panels]) {
        check(tree.nodes.closed7?.wasLoaded && !tree.nodes.closed7.loaded,
          'Closing a whole window preserves its tabs for reopening');
      }
      passed.push('whole-window closure preserves saved tabs');

      state = await fixture();
      await merge(state.tree, false);
      check(state.tree.getNodeByTabId(701) === null,
        'A previous browser session does not retain a stale close-event identity');
      check(state.tree.nodes.closed7.wasLoaded,
        'Recovery without a close event continues preserving missing tabs');
      passed.push('browser restart keeps crash-recovery behavior');
      return passed;
    });
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log(`PASS: ${passed.join('; ')}`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
