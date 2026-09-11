// Run with Playwright available: node tests/sidebar.cjs
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
    if (pathname === '/_favicon/') {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="red"/></svg>');
    }
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
    let contents = await fs.readFile(filename);
    if (pathname.endsWith('sidepanel.html')) {
      contents = contents.toString().replace('<script type="module" src="./view.js"></script>', '');
    }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[path.extname(filename)] || 'application/octet-stream');
    res.end(contents);
  } catch {
    res.writeHead(404).end();
  }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 380, height: 640 } });
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.addInitScript(() => {
      window.messages = [];
      window.chrome = {
        runtime: {
          getURL: value => new URL(value, location.origin).href,
          sendMessage: async value => { window.messages.push(value); return {}; }
        },
        windows: { getCurrent: async (options, callback) => {
          const win = { id: 7, incognito: false };
          callback?.(win);
          return win;
        } },
        tabs: { query: async query => {
          window.tabQuery = query;
          return [{ id: 99, windowId: 7, active: true }];
        } }
      };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/view/sidepanel.html`);
    await page.evaluate(async () => {
      const { TreeView } = await import('/view/treeview.js');
      const { NodeView } = await import('/view/nodeview.js');
      const { Mutex } = await import('/common/mutex.js');
      const tree = window.tree = new TreeView();
      Object.assign(tree.cfg, tree.cfgDefaults, { treeViewZoomLevel: 1, doubleClickMs: 0, cursorFollowsActiveTab: false });
      tree.initElements();
      tree.keyEventMutex = new Mutex();
      tree.viewScope = 'session';
      tree.windowId = 7;
      tree.detailsState = 0;
      tree.root.label = 'Session';
      const add = (id, parent, fields = {}) => {
        const node = new NodeView(tree, parent);
        Object.assign(node, { id, label: id, url: `https://example.test/${id}`, loaded: true }, fields);
        parent.nodes.push(node);
        tree.nodes[id] = node;
        return node;
      };
      const win = add('win', tree.root, { type: 'window', url: undefined, windowId: 7 });
      tree.windowNode = win;
      add('a', win, { url: 'https://example.test/same#one' });
      add('b', win, { url: 'https://example.test/same#two' });
      add('c', win);
      add('child', tree.nodes.c);
      add('d', win);
      for (let i = 0; i < 40; i++) add(`filler${i}`, win);
      const branch = add('branch', win, { expanded: false });
      add('active', branch, { tabId: 99, active: true });
      tree.$renderWholeTree();
      tree.resolveTreeLoaded();
      tree.resolveTreeViewLoaded();
      tree.initBodyHandlers();
      tree.initKeyHandler();
      tree.initMouseHandler();
      tree.initButtonHandlers();
      tree.$renderZoomButtons();
      tree.$renderFlattenLoneChildBtn();
      tree.$renderHoverMenu();
      tree.markDupNodes();
      await tree.setCursor(tree.nodes.a, { instant: true });
    });
    const marked = () => page.evaluate(() => Object.values(tree.nodes).filter(n => n.marked).map(n => n.id).sort());
    const settle = () => page.evaluate(async () => {
      const unlock = await tree.keyEventMutex.lock(); unlock();
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    const reset = async id => page.evaluate(async id => {
      await tree.action_unmarkAll({ type: 'keydown' });
      await tree.setCursor(tree.nodes[id], { instant: true });
    }, id);
    const checkSelectionRectangle = async ids => {
      await settle();
      const geometry = await page.evaluate(ids => {
        const rows = ids.map(id => tree.nodes[id].$row.getBoundingClientRect());
        const box = document.querySelector('.selection-highlight');
        const rect = box.getBoundingClientRect();
        return {
          actual: [rect.left, rect.right, rect.top, rect.bottom],
          expected: [Math.min(...rows.map(r => r.left)), Math.max(...rows.map(r => r.right)), rows[0].top, rows.at(-1).bottom],
          radius: getComputedStyle(box).borderRadius,
          fill: getComputedStyle(box).backgroundImage,
          rowBackgrounds: ids.map(id => getComputedStyle(tree.nodes[id].$).backgroundImage)
        };
      }, ids);
      geometry.actual.forEach((value, index) => assert.ok(Math.abs(value - geometry.expected[index]) < 1, `Selection edge ${index}: ${value} should match ${geometry.expected[index]}`));
      assert.equal(geometry.radius, '0px');
      assert.notEqual(geometry.fill, 'none');
      assert.ok(geometry.rowBackgrounds.every(bg => bg === 'none'), 'No rounded branch selection backgrounds remain');
    };

    assert.deepEqual(await page.locator('#top-tools > .button').evaluateAll(buttons => buttons.map(b => b.id)), ['options-btn', 'help-btn', 'locate-tab-btn']);
    assert.equal(await page.locator('#options-btn svg').count(), 1);
    assert.equal((await page.locator('#options-btn').textContent()).trim(), '');
    assert.equal(await page.locator('#help-btn').isVisible(), false);
    assert.deepEqual(await page.locator('#bottom-bar > .button').evaluateAll(buttons => buttons.map(b => b.id)), ['details-btn', 'flatten-lone-child-btn', 'filter-btn', 'dup-btn', 'backup-btn']);
    for (const hideZoomButtons of [false, true]) {
      await page.evaluate(hide => { tree.cfg.hideZoomButtons = hide; tree.$renderZoomButtons(); }, hideZoomButtons);
      assert.equal(await page.locator('#flatten-lone-child-btn').isVisible(), true, 'Bottom Flat button stays available regardless of zoom visibility');
    }
    await page.evaluate(() => {
      window.openedPages = [];
      window.originalOpenInternalPage = tree.openInternalPage;
      tree.openInternalPage = path => openedPages.push(path);
    });
    await page.locator('#options-btn').click();
    assert.deepEqual(await page.evaluate(() => openedPages), ['/options/options.html']);
    await page.evaluate(() => { tree.openInternalPage = originalOpenInternalPage; });

    assert.equal(await page.locator('#dup-count').textContent(), '1');
    await page.evaluate(async () => {
      await tree.windowNode.addChild(0, { id: 'thirdcopy', url: tree.nodes.a.url, render: true }, { reason: 'tree_nodeAdded' });
    });
    await page.waitForFunction(() => tree.duplicateCount === 2);
    assert.equal(await page.locator('#dup-count').textContent(), '2', 'Three matching tabs have two extra copies');
    await page.evaluate(() => tree.nodes.thirdcopy.deleteSelf({ reason: 'tree_nodeDeleted' }));
    await page.waitForFunction(() => tree.duplicateCount === 1);
    await page.locator('#dup-btn').click();
    await page.waitForFunction(() => tree.dupViewActive);
    await page.locator('#dup-btn').click();
    await page.waitForFunction(() => !tree.dupViewActive);
    assert.equal(await page.locator('#dup-count').isVisible(), true, 'Badge persists after opening Dup');

    await reset('a');
    await page.keyboard.press('Shift+ArrowDown'); await settle();
    assert.deepEqual(await marked(), ['a', 'b']);
    await page.keyboard.press('Shift+ArrowDown'); await settle();
    assert.deepEqual(await marked(), ['a', 'b', 'c']);
    await page.keyboard.press('Shift+ArrowUp'); await settle();
    assert.deepEqual(await marked(), ['a', 'b']);
    await page.keyboard.press('Shift+ArrowRight'); await settle();
    assert.deepEqual(await marked(), ['a', 'b', 'c']);
    await page.keyboard.press('Shift+ArrowLeft'); await settle();
    assert.deepEqual(await marked(), ['a', 'b']);
    await page.keyboard.press('Shift+ArrowUp'); await settle();
    assert.deepEqual(await marked(), [], 'Returning to the anchor clears the whole range');
    await page.keyboard.press('Shift+ArrowDown'); await settle();
    assert.deepEqual(await marked(), ['a', 'b'], 'Range can expand again after returning to the anchor');
    assert.equal(await page.locator('#marked-count svg').count(), 1);
    const clearBounds = await page.locator('#clear-marked-btn').boundingBox();
    const countBounds = await page.locator('#marked-count').boundingBox();
    assert.ok(clearBounds.x + clearBounds.width < countBounds.x, 'Broom appears to the left of the move count');
    await page.locator('#clear-marked-btn').click(); await settle();
    assert.deepEqual(await marked(), [], 'Broom clears every selected node');
    assert.equal(await page.locator('#marked-actions').isVisible(), false);

    await reset('a');
    await page.locator('#nodechild > .row .node-link').click({ modifiers: ['Shift'] }); await settle();
    assert.deepEqual(await marked(), ['a', 'b', 'c', 'child']);
    assert.equal(await page.locator('.selection-highlight').count(), 1);
    await checkSelectionRectangle(['a', 'b', 'c', 'child']);
    await page.locator('#nodea > .row .node-link').click({ modifiers: ['Shift'] }); await settle();
    assert.deepEqual(await marked(), [], 'Shift-clicking the anchor clears the whole range');
    await page.locator('#nodechild > .row .node-link').click({ modifiers: ['Shift'] }); await settle();
    assert.equal(page.url().endsWith('/view/sidepanel.html'), true);
    await page.locator('#nodechild > .row .node-link').click({ modifiers: ['Meta'] }); await settle();
    assert.deepEqual(await marked(), ['a', 'b', 'c']);
    await checkSelectionRectangle(['a', 'b', 'c']);
    await page.locator('#nodechild > .row .node-link').click({ modifiers: ['Meta'] }); await settle();
    assert.deepEqual(await marked(), ['a', 'b', 'c', 'child']);
    await page.evaluate(() => tree.setCursor(tree.nodes.a, { instant: true }));
    await page.locator('#nodeb > .row .node-link').click({ modifiers: ['Shift'] }); await settle();
    assert.deepEqual(await marked(), ['c', 'child'], 'Shift-click from marked anchor clears range');
    await page.keyboard.press('Shift+ArrowUp'); await settle();
    assert.deepEqual(await marked(), ['a', 'b', 'c', 'child'], 'Returning a deselection range to its anchor restores the original marks');

    await page.evaluate(async () => {
      const nested = await tree.windowNode.addChild(tree.nodes.d.indexOf(),
        { id: 'nested-window', label: 'Nested window', type: 'window', render: true }, { reason: 'tree_nodeAdded' });
      await nested.addChild(0, { id: 'nested-note', label: 'Nested note', render: true }, { reason: 'tree_nodeAdded' });
      await tree.action_unmarkAll({});
      await tree.setCursor(tree.nodes.a, { instant: true });
      await tree.selectRangeTo(tree.nodes.d);
    });
    const nestedSelection = ['a', 'b', 'c', 'child', 'nested-window', 'nested-note', 'd'];
    assert.equal(await page.locator('.selection-highlight').count(), 1);
    await checkSelectionRectangle(nestedSelection);
    for (const theme of ['tk-night', 'tk-day']) {
      await page.locator('#theme-variant').evaluate((el, theme) => { el.href = `/themes/${theme}.css`; }, theme);
      await page.waitForFunction(theme => Array.from(document.styleSheets).some(sheet => sheet.href?.endsWith(`${theme}.css`)), theme);
      await page.evaluate(() => { tree.hideHoverMenu(); tree.scrollNodeIntoView(tree.nodes.a, 0); });
      await checkSelectionRectangle(nestedSelection);
      if (process.env.SCREENSHOT_DIR) {
        await fs.mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${theme}-nested-selection.png`) });
      }
    }
    await page.setViewportSize({ width: 300, height: 640 });
    await checkSelectionRectangle(nestedSelection);
    await page.evaluate(async () => { await tree.setZoomLevel(0.75, 1); tree.$.scrollTop += 50; });
    await checkSelectionRectangle(nestedSelection);
    await page.evaluate(async () => {
      await tree.setZoomLevel(1, 0.75);
      tree.$body.classList.add('flatten-lone-child');
      tree.scheduleSelectionHighlight();
    });
    await checkSelectionRectangle(nestedSelection);
    await page.locator('#nodeb > .row .node-link').click({ modifiers: ['Meta'] }); await settle();
    assert.equal(await page.locator('.selection-highlight').count(), 2, 'An unselected row splits the highlight into separate rectangles');
    await page.evaluate(async () => {
      tree.$body.classList.remove('flatten-lone-child');
      await tree.action_unmarkAll({});
      await tree.nodes['nested-window'].deleteSelf({ reason: 'tree_nodeDeleted' });
    });
    await settle();
    assert.equal(await page.locator('.selection-highlight').count(), 0);
    await page.setViewportSize({ width: 380, height: 640 });
    await page.locator('#theme-variant').evaluate(el => { el.href = '/themes/tk-night.css'; });

    await reset('a');
    await page.locator('#dup-btn').click();
    await page.waitForFunction(() => tree.dupViewActive);
    await page.keyboard.press('Shift+ArrowDown'); await settle();
    await page.keyboard.press('Shift+ArrowDown'); await settle();
    assert.deepEqual(await marked(), ['a', 'b'], 'Selection skips rows hidden by Dup');
    await page.locator('#locate-tab-btn').click();
    await page.waitForFunction(() => tree.cursor.id === 'active');
    assert.deepEqual(await page.evaluate(() => tabQuery), { active: true, windowId: 7 });
    assert.equal(await page.evaluate(() => tree.dupViewActive), false);
    assert.equal(await page.evaluate(() => tree.nodes.branch.expanded), false, 'Locator uses temporary expansion');
    const activeBounds = await page.locator('#nodeactive > .row').boundingBox();
    const treeBounds = await page.locator('#tree-view').boundingBox();
    assert.ok(activeBounds.y >= treeBounds.y && activeBounds.y + activeBounds.height <= treeBounds.y + treeBounds.height);
    assert.equal(await page.locator('#nodeactive > .row').evaluate(el => el.classList.contains('cursor')), true);

    await page.evaluate(async () => {
      await tree.nodes.b.setTabFields({ url: 'https://example.test/unique' }, { reason: 'tree_nodeChanged' });
    });
    await page.waitForFunction(() => tree.duplicateCount === 0);
    assert.equal(await page.locator('#dup-count').isVisible(), false);
    await page.evaluate(async () => {
      await tree.windowNode.addChild(0, { id: 'newdup', url: tree.nodes.a.url, render: true }, { reason: 'tree_nodeAdded' });
    });
    await page.waitForFunction(() => tree.duplicateCount === 1);
    assert.equal(await page.locator('#dup-count').isVisible(), true);
    await page.locator('#dup-btn').click();
    await page.waitForFunction(() => tree.dupViewActive);
    await page.evaluate(() => tree.nodes.newdup.deleteSelf({ reason: 'tree_nodeDeleted' }));
    await page.waitForFunction(() => tree.duplicateCount === 0);
    assert.equal(await page.locator('#dup-count').isVisible(), false);
    await page.evaluate(async () => {
      await tree.nodes.branch.addChild(0, { id: 'burieddup', url: tree.nodes.a.url, render: true }, { reason: 'tree_nodeAdded' });
    });
    await page.waitForFunction(() => tree.duplicateCount === 1);
    await page.locator('#nodeburieddup > .row').waitFor({ state: 'visible' });
    await page.locator('#locate-tab-btn').click();
    await page.waitForFunction(() => !tree.dupViewActive && tree.cursor.id === 'active');

    await reset('a');
    await page.locator('#filter-btn').click();
    await page.locator('#filter-entry').fill('same');
    await page.waitForFunction(() => tree.filterString === 'same' && tree.nodes.a.filterMatch);
    await page.locator('#nodeburieddup > .row .node-link').click({ modifiers: ['Shift'] }); await settle();
    assert.deepEqual(await marked(), ['a', 'branch', 'burieddup'], 'Shift-click exits filter entry and selects only visible rows');
    await page.locator('#filter-entry').focus();
    await page.keyboard.press('Shift+ArrowLeft');
    assert.deepEqual(await marked(), ['a', 'branch', 'burieddup'], 'Shift-arrows in text inputs retain normal text selection');
    await page.locator('#locate-tab-btn').click();
    await page.waitForFunction(() => !tree.filterViewActive && tree.cursor.id === 'active');

    // Use real node moves on unloaded notes so browser tab APIs are not needed.
    await page.evaluate(() => {
      let sequence = 0;
      window.moveCase = async () => {
        await tree.action_unmarkAll({});
        tree.undoStack = []; tree.redoStack = [];
        tree.$renderUndoRedoBtns();
        const prefix = `move-test-${sequence++}-`;
        const add = (name, parent) => parent.addChild(parent.nodes.length,
          { id: prefix + name, label: name, render: true }, { reason: 'tree_nodeAdded' });
        const src = await add('src', tree.windowNode);
        const dest = await add('dest', tree.windowNode);
        const x = await add('x', src), y = await add('y', src), tail = await add('tail', src);
        const existing = await add('existing', dest);
        const child = await add('child', x);
        window.moveFixture = { src, dest, x, y, tail, existing, child, add };
        await x.setMarked(true, { reason: 'userAction', individual: true });
        await child.setMarked(true, { reason: 'userAction', individual: true });
        await y.setMarked(true, { reason: 'userAction', individual: true });
        await tree.setCursor(dest, { instant: true });
      };
    });
    await page.evaluate(() => moveCase());
    await page.locator('#marked-count').click(); await settle();
    assert.deepEqual(await page.evaluate(() => ({
      children: moveFixture.dest.nodes.map(n => n.label),
      history: tree.undoStack.length,
      nested: moveFixture.child.parent === moveFixture.x
    })), { children: ['x', 'y', 'existing'], history: 1, nested: true }, 'Selected branches move once, as one undo entry');
    await page.locator('#undo-btn').click(); await settle();
    assert.deepEqual(await page.evaluate(() => moveFixture.src.nodes.map(n => n.label)), ['x', 'y', 'tail']);
    await page.locator('#redo-btn').click(); await settle();
    assert.deepEqual(await page.evaluate(() => moveFixture.dest.nodes.map(n => n.label)), ['x', 'y', 'existing']);
    await page.evaluate(() => moveFixture.y.deleteSelf({ reason: 'tree_nodeDeleted' }));
    await page.locator('#undo-btn').click(); await settle();
    assert.deepEqual(await page.evaluate(() => moveFixture.src.nodes.map(n => n.label)), ['x', 'tail']);
    assert.match(await page.locator('#status-text').textContent(), /skipped 1/);
    await page.locator('#redo-btn').click(); await settle();
    assert.deepEqual(await page.evaluate(() => moveFixture.dest.nodes.map(n => n.label)), ['x', 'existing']);
    assert.equal(await page.evaluate(() => !!tree.nodes[moveFixture.y.id]), false, 'Redo does not revive deleted nodes');

    const replayCases = await page.evaluate(async () => {
      const results = {};
      await moveCase();
      await tree.action_pasteMarked({});
      await moveFixture.src.deleteSelf({ reason: 'tree_nodeDeleted' });
      await tree.action_undo({});
      results.missingParent = [moveFixture.x.parent === moveFixture.dest, tree.redoStack.length, tree.$statusText.textContent];

      await moveCase();
      await tree.action_pasteMarked({});
      await tree.action_undo({});
      await moveFixture.dest.deleteSelf({ reason: 'tree_nodeDeleted' });
      await tree.action_redo({});
      results.missingDestination = [moveFixture.src.nodes.map(n => n.label), tree.undoStack.length];

      await moveCase();
      await tree.action_pasteMarked({});
      await moveFixture.tail.deleteSelf({ reason: 'tree_nodeDeleted' });
      const inserted = await moveFixture.add('inserted', moveFixture.src);
      await tree.action_undo({});
      results.deletedNeighbor = [moveFixture.src.nodes.map(n => n.label), inserted.parent === moveFixture.src];

      await moveCase();
      await tree.action_pasteMarked({});
      await moveFixture.src.moveTo(moveFixture.x, 0, { reason: 'tree_nodeMoved' });
      await tree.action_undo({});
      results.cycle = [moveFixture.x.parent === moveFixture.dest, moveFixture.y.parent === moveFixture.src, tree.$statusText.textContent];

      await moveCase();
      await tree.action_pasteMarked({});
      const oldMove = moveFixture.y.moveTo;
      moveFixture.y.moveTo = async () => { throw new Error('Simulated unavailable move'); };
      await tree.action_undo({});
      moveFixture.y.moveTo = oldMove;
      results.failedMove = [moveFixture.x.parent === moveFixture.src, moveFixture.y.parent === moveFixture.dest, tree.$statusText.textContent];

      await moveCase();
      await tree.action_unmarkAll({});
      await tree.setCursor(moveFixture.src, { instant: true });
      await tree.action_flattenNode({ type: 'keydown' });
      results.flattenHistory = tree.undoStack.length;
      await tree.action_undo({});
      results.flattenUndo = moveFixture.child.parent === moveFixture.x;
      await moveFixture.add('late-child', moveFixture.x);
      await tree.action_redo({});
      results.flattenRedo = [moveFixture.child.parent === moveFixture.src, moveFixture.x.nodes.map(n => n.label)];
      return results;
    });
    assert.deepEqual(replayCases.missingParent.slice(0, 2), [true, 0]);
    assert.match(replayCases.missingParent[2], /skipped 2/);
    assert.deepEqual(replayCases.missingDestination, [['x', 'y', 'tail'], 0]);
    assert.deepEqual(replayCases.deletedNeighbor, [['x', 'y', 'inserted'], true]);
    assert.deepEqual(replayCases.cycle.slice(0, 2), [true, true]);
    assert.match(replayCases.cycle[2], /skipped 1/);
    assert.deepEqual(replayCases.failedMove.slice(0, 2), [true, true]);
    assert.match(replayCases.failedMove[2], /skipped 1/);
    assert.equal(replayCases.flattenHistory, 1);
    assert.equal(replayCases.flattenUndo, true);
    assert.deepEqual(replayCases.flattenRedo, [true, ['late-child']]);

    await page.evaluate(async () => {
      await moveCase();
      await tree.action_unmarkAll({});
      await tree.setCursor(moveFixture.x, { instant: true });
    });
    await page.keyboard.press('Meta+Shift+ArrowDown'); await settle();
    assert.deepEqual(await page.evaluate(() => [tree.undoStack.length, moveFixture.src.nodes.map(n => n.label)]), [1, ['y', 'x', 'tail']]);
    await page.locator('#undo-btn').click(); await settle();
    assert.deepEqual(await page.evaluate(() => moveFixture.src.nodes.map(n => n.label)), ['x', 'y', 'tail']);
    await page.evaluate(async () => {
      const originalTarget = tree.getMouseDragTarget;
      tree.getMouseDragTarget = () => ({ source: 'internal', sourceNode: moveFixture.x,
        targetNode: moveFixture.existing, destParent: moveFixture.dest, destIndex: 0 });
      try { await tree.action_mouseDrop({ preventDefault() {} }); }
      finally { tree.getMouseDragTarget = originalTarget; }
    });
    assert.equal(await page.evaluate(() => tree.undoStack.length), 1, 'Drag adds a history entry and clears the previous redo');
    assert.equal(await page.evaluate(() => tree.redoStack.length), 0);
    await page.locator('#undo-btn').click(); await settle();
    assert.deepEqual(await page.evaluate(() => moveFixture.src.nodes.map(n => n.label)), ['x', 'y', 'tail']);
    await reset('active');
    await page.evaluate(() => tree.nodes.active.setMarked(true, { reason: 'userAction' }));

    // A focus event on an already-open panel must restore full color, and
    // toolbar hover must not remove native button focus.
    await page.locator('#locate-tab-btn').focus();
    await page.locator('#nodeactive > .row').hover();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'locate-tab-btn');
    assert.equal(await page.locator('#sidebar-content').evaluate(el => getComputedStyle(el).filter), 'none');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.locator('#sidebar-content').evaluate(el => getComputedStyle(el).filter), 'grayscale(0.9)');
    assert.equal(await page.locator('#dup-count').evaluate(el => {
      for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) {
        if (getComputedStyle(ancestor).filter !== 'none') return false;
      }
      return getComputedStyle(el).backgroundColor === 'rgb(217, 35, 54)';
    }), true, 'Dup badge stays red without any ancestor grayscale filter');
    assert.equal(await page.locator('#nodeactive .node-favicon').evaluate(el => getComputedStyle(el).filter), 'grayscale(1) brightness(0.65)');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal(await page.locator('#sidebar-content').evaluate(el => getComputedStyle(el).filter), 'none');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => tree.cursor.id === 'active');

    for (const theme of ['tk-night', 'tk-day']) {
      await page.locator('#theme-variant').evaluate((el, theme) => { el.href = `/themes/${theme}.css`; }, theme);
      await page.setViewportSize({ width: 260, height: 640 });
      const button = await page.locator('#locate-tab-btn').boundingBox();
      assert.ok(button.x + button.width <= 260 && button.y < 20, 'Locator stays at top right');
      const options = await page.locator('#options-btn').boundingBox();
      assert.ok(options.x + options.width <= button.x, 'Options stays to the left of the crosshair');
      assert.ok(Math.abs(options.y - button.y) < 1);
      const primary = await page.locator('#view-scope-btn').boundingBox();
      assert.ok(Math.abs(primary.y - button.y) < 1, 'Top controls fit one aligned row at standard sidebar widths');
      const bottomButtons = await page.locator('#bottom-bar > .button').evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect();
        return { id: button.id, y: rect.y, right: rect.right, height: rect.height, fits: button.scrollWidth <= button.clientWidth };
      }));
      assert.ok(bottomButtons.every(b => Math.abs(b.y - bottomButtons[0].y) < 1 && b.fits), 'Bottom buttons fit a single row without clipped labels');
      assert.equal(bottomButtons.at(-1).id, 'backup-btn');
      assert.ok(bottomButtons.every(b => Math.abs(b.height - button.height) < 1), 'Top and bottom buttons share a consistent height');
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const dupButton = await page.locator('#dup-btn').boundingBox();
      const badge = await page.locator('#dup-count').boundingBox();
      assert.ok(badge.x < dupButton.x && badge.x + badge.width > dupButton.x, 'Dup badge stays at the top-left corner when the toolbar wraps');
      assert.ok(badge.y < dupButton.y && badge.y + badge.height > dupButton.y);
      if (process.env.SCREENSHOT_DIR) {
        await fs.mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${theme}.png`) });
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${theme}-unfocused.png`) });
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      }
    }
    for (const zoom of [0.75, 1.5]) {
      await page.evaluate(async zoom => {
        await tree.setZoomLevel(zoom, tree.zoomLevel);
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      }, zoom);
      const button = await page.locator('#dup-btn').boundingBox();
      const badge = await page.locator('#dup-count').boundingBox();
      assert.ok(badge.x < button.x && badge.x + badge.width > button.x, 'Top-left badge follows sidebar zoom');
      assert.ok(badge.y >= -1 && badge.y <= button.y + button.height, 'Badge stays visible at the top edge');
    }
    await page.evaluate(() => tree.$topBar.classList.add('hidden'));
    await settle();
    assert.equal(await page.locator('#dup-count').isVisible(), true, 'Hiding the top toolbar does not hide the bottom Dup badge');
    await page.evaluate(() => tree.$bottomBar.classList.add('hidden'));
    await page.locator('#dup-count').waitFor({ state: 'hidden' });
    await page.evaluate(() => { tree.$topBar.classList.remove('hidden'); tree.$bottomBar.classList.remove('hidden'); });
    await page.locator('#dup-count').waitFor({ state: 'visible' });
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log('PASS: selection controls, range selection, live Dup count, active-tab reveal, move/drag/flatten undo and redo after tree changes, focus styling, and both theme layouts');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
