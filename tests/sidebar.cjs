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

    // Browser window focus must preserve each sidebar's browsing position.
    // Only active-tab changes in its own focused window should reveal a row.
    const sidebarPosition = () => ({
      cursor: tree.cursor.id,
      scrollTop: tree.$.scrollTop,
      branchExpanded: tree.nodes.branch.isExpanded()
    });
    const settleFollowing = async () => {
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 20)));
      await page.waitForFunction(() => !tree.smoothScrollInProgress);
      await settle();
    };
    const expectPositionPreserved = async (change, message) => {
      const before = await page.evaluate(sidebarPosition);
      await page.evaluate(change);
      await settleFollowing();
      assert.deepEqual(await page.evaluate(sidebarPosition), before, message);
    };
    const expectTabRevealed = async id => {
      await page.waitForFunction(id => tree.cursor.id === id, id);
      await settleFollowing();
      const row = await page.locator(`#node${id} > .row`).boundingBox();
      const container = await page.locator('#tree-view').boundingBox();
      assert.ok(row.y >= container.y && row.y + row.height <= container.y + container.height,
        `Active tab ${id} is scrolled into view`);
    };
    await page.evaluate(async () => {
      window.activateNode = (id, active) => tree.tree_nodeChanged({
        nodeId: id, type: 'setActive', active, loaded: true
      });
      const win = await tree.root.addChild(tree.root.nodes.length,
        { id: 'focus-other-window', type: 'window', windowId: 8, loaded: true, render: true },
        { reason: 'tree_nodeAdded' });
      await win.addChild(0,
        { id: 'focus-other-tab', url: 'https://other.test', loaded: true, active: true, render: true },
        { reason: 'tree_nodeAdded' });
    });
    for (const scope of ['session', 'window']) {
      await page.evaluate(scope => {
        tree.viewScope = scope;
        tree.windowNode.active = false;
        tree.nodes['focus-other-window'].active = true;
        tree.nodes.active.active = true;
        tree.nodes.c.active = false;
        tree.expandOverrideClear();
        tree.$renderWholeTree();
        tree.cfg.cursorFollowsActiveTab = true;
      }, scope);
      await reset('a');
      await expectPositionPreserved(async () => {
        await activateNode('focus-other-window', false);
        await activateNode('win', true);
      }, `${scope}: focusing this window preserves scroll, cursor, and folds`);
      assert.equal(await page.evaluate(() => tree.windowNode.isActive()), true,
        'Window focus state still updates');
      await expectPositionPreserved(() => activateNode('active', true),
        `${scope}: a repeated activation notification does not scroll`);
      await expectPositionPreserved(async () => {
        await activateNode('win', false);
        await activateNode('focus-other-window', true);
      }, `${scope}: focusing another window preserves the sidebar position`);
      await expectPositionPreserved(async () => {
        await activateNode('active', false);
        await activateNode('c', true);
      }, `${scope}: tab changes in this window while unfocused do not scroll`);
      await expectPositionPreserved(async () => {
        await activateNode('focus-other-tab', false);
        await activateNode('focus-other-tab', true);
      }, `${scope}: tab changes in another focused window do not scroll`);
      await expectPositionPreserved(async () => {
        await tree.tree_nodeChanged({ nodeId: 'focus-other-window',
          type: 'setTabFields', changes: { active: false } });
        await tree.tree_nodeChanged({ nodeId: 'win',
          type: 'setTabFields', changes: { active: true } });
      }, `${scope}: bulk window focus updates do not scroll`);

      await page.evaluate(async () => {
        await activateNode('c', false);
        await activateNode('active', true);
      });
      await expectTabRevealed('active');
      assert.equal(await page.evaluate(() => tree.nodes.branch.expanded), false,
        'Following a tab only temporarily expands its parents');

      await reset('a');
      await page.evaluate(async () => {
        await activateNode('active', false);
        await tree.nodes.branch.addChild(tree.nodes.branch.nodes.length,
          { id: 'focus-new-tab', url: 'https://new.test', tabId: 100, loaded: true, active: true, render: true },
          { reason: 'tree_nodeAdded' });
      });
      await expectTabRevealed('focus-new-tab');

      await reset('a');
      await page.evaluate(async () => {
        await activateNode('focus-new-tab', false);
        await tree.tree_nodeChanged({ nodeId: 'active',
          type: 'setTabFields', changes: { active: true } });
      });
      await expectTabRevealed('active');

      await page.evaluate(async () => {
        await activateNode('active', false);
        await activateNode('focus-new-tab', true);
      });
      await expectTabRevealed('focus-new-tab');
      await reset('a');
      await page.evaluate(async () => {
        await tree.nodes['focus-new-tab'].deleteSelf({ reason: 'tree_nodeDeleted' });
        await activateNode('active', true);
      });
      await expectTabRevealed('active');

      await page.evaluate(() => activateNode('active', false));
      await reset('a');
      await expectPositionPreserved(async () => {
        await activateNode('active', true);
        await activateNode('win', false);
      }, `${scope}: losing focus cancels a pending tab reveal`);
      await page.evaluate(() => { tree.cfg.cursorFollowsActiveTab = false; });
    }
    await page.evaluate(async () => {
      tree.viewScope = 'session';
      await tree.nodes['focus-other-window'].deleteSelf({ reason: 'tree_nodeDeleted' });
      tree.windowNode.prevActiveTab = null;
      tree.expandOverrideClear();
      tree.$renderWholeTree();
    });
    await reset('a');

    assert.deepEqual(await page.locator('#top-tools > .button').evaluateAll(buttons => buttons.map(b => b.id)), ['options-btn', 'help-btn', 'locate-tab-btn']);
    assert.equal(await page.locator('#options-btn svg').count(), 1);
    assert.equal((await page.locator('#options-btn').textContent()).trim(), '');
    assert.equal(await page.locator('#help-btn').isVisible(), false);
    assert.deepEqual(await page.locator('#bottom-bar > .button').evaluateAll(buttons => buttons.map(b => b.id)), ['details-btn', 'filter-btn', 'dup-btn', 'backup-btn']);
    for (const hideZoomButtons of [false, true]) {
      await page.evaluate(hide => { tree.cfg.hideZoomButtons = hide; tree.$renderZoomButtons(); }, hideZoomButtons);
      assert.equal(await page.locator('#top-primary > #redo-btn + #flatten-lone-child-btn').isVisible(), true, 'Flat stays beside Undo/Redo regardless of zoom visibility');
    }
    await page.evaluate(() => {
      window.openedPages = [];
      window.originalOpenInternalPage = tree.openInternalPage;
      tree.openInternalPage = path => openedPages.push(path);
    });
    await page.locator('#options-btn').click();
    assert.deepEqual(await page.evaluate(() => openedPages), ['/options/options.html']);
    await page.evaluate(() => { tree.openInternalPage = originalOpenInternalPage; });

    for (const theme of ['tk-day', 'tk-night']) {
      await page.locator('#theme-variant').evaluate((el, theme) => { el.href = `/themes/${theme}.css`; }, theme);
      await page.waitForFunction(theme => Array.from(document.styleSheets).some(sheet => sheet.href?.endsWith(`${theme}.css`)), theme);
      await page.locator('#nodeb > .row .node-link').click(); await settle();
      assert.equal(await page.locator('#nodeb > .row .node-link').evaluate(el => document.activeElement === el), true);
      assert.equal(await page.locator('#nodeb > .row .node-link').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'Mouse-focused node links have no text outline');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('#nodeb > .row .node-dup-marker').evaluate(el => document.activeElement === el && el.matches(':focus-visible')), true, 'Duplicate markers are keyboard accessible');
      await page.keyboard.press('Shift+Tab');
      assert.deepEqual(await page.locator('#nodea > .row .node-link').evaluate(el => ({
        focused: document.activeElement === el,
        visible: el.matches(':focus-visible'),
        style: getComputedStyle(el).outlineStyle,
        width: getComputedStyle(el).outlineWidth
      })), { focused: true, visible: true, style: 'inset', width: '4px' }, 'Keyboard navigation preserves the focus outline');
      const marker = await page.locator('#nodea > .row .node-dup-marker').boundingBox();
      const favicon = await page.locator('#nodea > .row .node-favicon').boundingBox();
      assert.ok(marker.width > 0 && marker.x + marker.width <= favicon.x, 'Duplicate marker sits to the left of the favicon');
      assert.equal((await page.locator('#nodea > .row').boundingBox()).height, (await page.locator('#nodeb > .row').boundingBox()).height);
    }

    assert.equal(await page.locator('#dup-count').textContent(), '1');
    assert.equal(await page.locator('.node-dup-marker').count(), 2, 'Only matching rows have markers in normal view');
    assert.deepEqual(await page.locator('.node-dup-marker').allTextContents(), ['1', '1'], 'Row badges count only the other matching tabs');
    assert.equal(await page.locator('#nodea > .row .node-dup-marker').getAttribute('aria-label'), '1 other matching tab — jump to next duplicate');
    await reset('c');
    await page.evaluate(() => { window.messages = []; });
    await page.locator('#nodea > .row .node-dup-marker').click(); await settle();
    assert.equal(await page.evaluate(() => tree.cursor.id), 'b', 'Clicking the marker jumps to the next matching row');
    await page.keyboard.press('Enter'); await settle();
    assert.equal(await page.evaluate(() => tree.cursor.id), 'a', 'Enter wraps to the first duplicate');
    await page.keyboard.press('Space'); await settle();
    assert.equal(await page.evaluate(() => tree.cursor.id), 'b', 'Space activates the focused marker');
    await page.locator('#nodea > .row .node-dup-marker').dblclick(); await settle();
    await page.locator('#nodea > .row .node-dup-marker').click({ modifiers: ['Shift'] }); await settle();
    assert.deepEqual(await marked(), [], 'Marker clicks do not select a range');
    assert.deepEqual(await page.evaluate(() => messages), [], 'Marker gestures do not load tabs or change stored tree data');
    await page.evaluate(() => { tree.cfg.showFavicons = false; tree.$renderWholeTree(); });
    assert.equal(await page.locator('.node-favicon').count(), 0);
    await page.locator('#nodeb > .row .node-dup-marker').click(); await settle();
    assert.equal(await page.evaluate(() => tree.cursor.id), 'a', 'Markers still work when favicons are disabled');
    await page.evaluate(() => { tree.cfg.showFavicons = true; tree.$renderWholeTree(); });

    await page.evaluate(async () => {
      await tree.windowNode.addChild(0, { id: 'thirdcopy', url: tree.nodes.a.url, render: true }, { reason: 'tree_nodeAdded' });
    });
    await page.waitForFunction(() => tree.duplicateCount === 2);
    assert.equal(await page.locator('#dup-count').textContent(), '2', 'Three matching tabs have two extra copies');
    assert.deepEqual(await page.locator('.node-dup-marker').allTextContents(), ['2', '2', '2'], 'Every row badge updates when another matching tab is added');
    await page.locator('#nodeb > .row .node-dup-marker').click(); await settle();
    assert.equal(await page.evaluate(() => tree.cursor.id), 'thirdcopy', 'Cycling wraps in tree order after adding a duplicate');
    await page.evaluate(async () => {
      await tree.nodes.thirdcopy.moveTo(tree.windowNode, tree.nodes.b.indexOf(), { reason: 'tree_nodeMoved' });
      // Click before the debounced refresh to exercise stale ordering.
      tree.nodes.a.$dupMarker.click();
    });
    await settle();
    assert.equal(await page.evaluate(() => tree.cursor.id), 'thirdcopy', 'Navigation uses the current order immediately after a move');
    await page.evaluate(() => tree.nodes.thirdcopy.deleteSelf({ reason: 'tree_nodeDeleted' }));
    await page.waitForFunction(() => tree.duplicateCount === 1);
    assert.deepEqual(await page.locator('.node-dup-marker').allTextContents(), ['1', '1'], 'Row counts decrease when a duplicate is deleted');
    await page.locator('#dup-btn').click();
    await page.waitForFunction(() => tree.dupViewActive);
    await page.locator('#dup-btn').click();
    await page.waitForFunction(() => !tree.dupViewActive);
    assert.equal(await page.locator('#dup-count').isVisible(), true, 'Badge persists after opening Dup');
    assert.equal(await page.locator('.node-dup-marker').count(), 2, 'Markers persist after leaving Dup view');

    await page.evaluate(async () => {
      const win = await tree.root.addChild(tree.root.nodes.length,
        { id: 'other-window', type: 'window', expanded: false, render: true }, { reason: 'tree_nodeAdded' });
      await win.addChild(0, { id: 'other-copy', url: tree.nodes.a.url, wasLoaded: true, render: true }, { reason: 'tree_nodeAdded' });
      tree.viewScope = 'window';
      tree.$renderWholeTree();
    });
    await page.locator('#nodeb > .row .node-dup-marker').click(); await settle();
    assert.equal(await page.evaluate(() => tree.cursor.id), 'other-copy', 'Jump reveals a duplicate in another window');
    assert.equal(await page.evaluate(() => tree.viewScope), 'session');
    assert.equal(await page.evaluate(() => tree.nodes['other-window'].expanded), false, 'Hidden matches use temporary expansion');
    const revealed = await page.locator('#nodeother-copy > .row').boundingBox();
    const viewport = await page.locator('#tree-view').boundingBox();
    assert.ok(revealed.y >= viewport.y && revealed.y + revealed.height <= viewport.y + viewport.height, 'Destination is scrolled into view');
    await page.locator('#nodeother-copy > .row .node-dup-marker').click(); await settle();
    assert.equal(await page.evaluate(() => tree.cursor.id), 'a', 'Unloaded copies participate in the same cycle');
    await page.evaluate(() => tree.nodes['other-window'].deleteSelf({ reason: 'tree_nodeDeleted' }));
    await page.waitForFunction(() => tree.duplicateCount === 1);

    await page.locator('#filter-btn').click();
    await page.locator('#filter-entry').fill('#one');
    await page.waitForFunction(() => tree.nodes.a.filterMatch && !tree.nodes.b.filterMatch);
    await page.locator('#nodea > .row .node-dup-marker').click(); await settle();
    assert.equal(await page.evaluate(() => tree.cursor.id), 'b', 'Jump reveals a match hidden by the text filter');
    assert.equal(await page.evaluate(() => tree.filterViewActive), false);

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
    assert.equal(await page.getByRole('button', { name: 'Move marked items before the selected item', exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('button', { name: 'Move marked items as first children of the selected item', exact: true }).isVisible(), true);
    assert.equal(await page.locator('#marked-count-value').textContent(), '2');
    const clearBounds = await page.locator('#clear-marked-btn').boundingBox();
    const countBounds = await page.locator('#marked-count').boundingBox();
    assert.ok(clearBounds.x + clearBounds.width < countBounds.x, 'Broom appears to the left of the marked-item count');
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
    assert.equal(await page.locator('.node-dup-marker').count(), 0, 'URL changes remove markers from both former duplicates');
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

    // A closed window containing just one leaf tab is one deletion action,
    // whether expanded or collapsed, and undo restores both nodes.
    const singleTabDeletion = await page.evaluate(async () => {
      const results = [];
      const originalDialog = tree.inputDialog;
      let prompts = 0;
      tree.inputDialog = async () => { prompts++; return { button: 'Cancel' }; };
      try {
        for (const expanded of [true, false]) {
          const win = await tree.root.addChild(tree.root.nodes.length,
            { id: 'delete-window', type: 'window', expanded, render: true },
            { reason: 'tree_nodeAdded' });
          await win.addChild(0, { id: 'delete-tab', url: 'https://delete.test',
            wasLoaded: true, note: 'Preserve on undo', render: true },
            { reason: 'tree_nodeAdded' });
          tree.undoStack = []; tree.redoStack = [];
          await tree.setCursor(win, { instant: true });
          await tree.action_deleteNode({ type: 'keydown' });
          const deleted = !tree.nodes['delete-window'] && !tree.nodes['delete-tab'];
          const historyLength = tree.undoStack.length;
          await tree.action_undo({});
          const restored = tree.nodes['delete-tab']?.parent === tree.nodes['delete-window']
            && tree.nodes['delete-tab']?.note === 'Preserve on undo';
          await tree.action_redo({});
          const deletedAgain = !tree.nodes['delete-window'] && !tree.nodes['delete-tab'];
          results.push({ expanded, prompts, deleted, historyLength, restored, deletedAgain });
          if (tree.nodes['delete-window'])
            await tree.nodes['delete-window'].deleteSelf({ reason: 'tree_nodeDeleted' });
        }
        const win = await tree.root.addChild(tree.root.nodes.length,
          { id: 'delete-window', type: 'window', render: true }, { reason: 'tree_nodeAdded' });
        const tab = await win.addChild(0,
          { id: 'delete-tab', url: 'https://delete.test', render: true }, { reason: 'tree_nodeAdded' });
        await tab.addChild(0, { id: 'delete-note', label: 'A third node', render: true },
          { reason: 'tree_nodeAdded' });
        await tree.setCursor(win, { instant: true });
        await tree.action_deleteNode({ type: 'keydown' });
        results.push({ prompts, keptLargerBranch: !!tree.nodes['delete-note'] });
        await win.deleteSelf({ reason: 'tree_nodeDeleted' });
      } finally {
        tree.inputDialog = originalDialog;
        tree.undoStack = []; tree.redoStack = [];
        tree.$renderUndoRedoBtns();
      }
      return results;
    });
    assert.deepEqual(singleTabDeletion, [
      { expanded: true, prompts: 0, deleted: true, historyLength: 1, restored: true, deletedAgain: true },
      { expanded: false, prompts: 0, deleted: true, historyLength: 1, restored: true, deletedAgain: true },
      { prompts: 1, keptLargerBranch: true }
    ]);

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
    // Both buttons use the selected item as their exact destination, regardless
    // of its expansion state, and keep nested selections together on undo/redo.
    for (const placement of ['before', 'first-child']) {
      for (const state of ['expanded', 'collapsed', 'empty']) {
        await page.evaluate(async state => {
          await moveCase();
          if (state === 'empty') await moveFixture.existing.deleteSelf({ reason: 'tree_nodeDeleted' });
          else await moveFixture.dest.setExpanded(state === 'expanded', { reason: 'userAction' });
          // A stale hovered row must not become the toolbar destination.
          tree.mouseNode = moveFixture.tail;
        }, state);
        await page.locator(`#move-marked-${placement}-btn`).click(); await settle();
        const expectedChildren = placement === 'before'
          ? (state === 'empty' ? [] : ['existing'])
          : ['x', 'y', ...(state === 'empty' ? [] : ['existing'])];
        const expected = {
          children: expectedChildren, adjacentBefore: placement === 'before',
          nested: true, history: 1, cursor: true,
          expanded: placement === 'first-child' || state !== 'collapsed'
        };
        const moveState = () => {
          const { dest, x, y, child } = moveFixture;
          return {
            children: dest.nodes.map(n => n.label),
            adjacentBefore: x.parent === dest.parent && y.parent === dest.parent
              && x.indexOf() === dest.indexOf() - 2 && y.indexOf() === dest.indexOf() - 1,
            nested: child.parent === x, history: tree.undoStack.length,
            cursor: tree.cursor === dest, expanded: dest.isExpanded()
          };
        };
        assert.deepEqual(await page.evaluate(moveState), expected, `${placement}: ${state} destination`);
        await page.locator('#undo-btn').click(); await settle();
        assert.deepEqual(await page.evaluate(() => moveFixture.src.nodes.map(n => n.label)), ['x', 'y', 'tail']);
        await page.locator('#redo-btn').click(); await settle();
        assert.deepEqual(await page.evaluate(moveState), expected, `${placement}: ${state} redo`);
      }
    }

    // Reordering existing siblings preserves marking order and the target item.
    for (const placement of ['before', 'first-child']) {
      await page.evaluate(async placement => {
        await moveCase();
        await tree.action_unmarkAll({});
        await moveFixture.y.setMarked(true, { reason: 'userAction' });
        await moveFixture.x.setMarked(true, { reason: 'userAction' });
        await tree.setCursor(placement === 'before' ? moveFixture.tail : moveFixture.src, { instant: true });
      }, placement);
      await page.locator(`#move-marked-${placement}-btn`).click(); await settle();
      assert.deepEqual(await page.evaluate(() => moveFixture.src.nodes.map(n => n.label)), ['y', 'x', 'tail'], `${placement} keeps marking order within the same parent`);
      await page.locator('#undo-btn').click(); await settle();
      assert.deepEqual(await page.evaluate(() => moveFixture.src.nodes.map(n => n.label)), ['x', 'y', 'tail']);
    }
    await page.evaluate(async () => {
      await moveCase();
      await tree.setCursor(moveFixture.x, { instant: true });
    });
    await page.locator('#move-marked-before-btn').click(); await settle();
    assert.deepEqual(await page.evaluate(() => moveFixture.src.nodes.map(n => n.label)), ['y', 'x', 'tail'], 'Before leaves a marked destination in place and moves other branches before it');
    assert.equal(await page.evaluate(() => moveFixture.child.parent === moveFixture.x), true);

    for (const placement of ['before', 'first-child']) {
      await page.evaluate(async () => {
        await moveCase();
        moveFixture.originalMove = moveFixture.x.moveTo;
        moveFixture.x.moveTo = async () => false;
      });
      await page.locator(`#move-marked-${placement}-btn`).click(); await settle();
      assert.deepEqual(await page.evaluate(() => {
        const { src, dest, x, y } = moveFixture;
        x.moveTo = moveFixture.originalMove;
        return {
          failedUnchanged: x.parent === src,
          adjacentBefore: y.parent === dest.parent && y.indexOf() === dest.indexOf() - 1,
          children: dest.nodes.map(n => n.label)
        };
      }), { failedUnchanged: true, adjacentBefore: placement === 'before',
        children: placement === 'before' ? ['existing'] : ['y', 'existing'] }, `${placement} retains the insertion point after a failed move`);
      assert.match(await page.locator('#status-text').textContent(), /Moved 1 nodes, 1 failed/);
    }

    // Reject destinations inside the moving branches without splitting branches
    // or moving unrelated marked items to a different destination.
    for (const [placement, target] of [['first-child', 'x'], ['first-child', 'child'], ['before', 'child'], ['before', 'root']]) {
      await page.evaluate(async target => {
        await moveCase();
        await tree.setCursor(target === 'root' ? tree.root : moveFixture[target], { instant: true });
      }, target);
      await page.locator(`#move-marked-${placement}-btn`).click(); await settle();
      assert.deepEqual(await page.evaluate(() => ({
        source: moveFixture.src.nodes.map(n => n.label),
        nested: moveFixture.child.parent === moveFixture.x,
        history: tree.undoStack.length
      })), { source: ['x', 'y', 'tail'], nested: true, history: 0 }, `${placement}: rejects ${target} without changing the tree`);
      assert.match(await page.locator('#status-text').textContent(), target === 'root' ? /session root/ : /outside the marked branches/);
    }

    await page.evaluate(() => moveCase());
    await page.locator('#move-marked-first-child-btn').click(); await settle();
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

    // Only focus plus a pointer outside the whole panel applies shading.
    // Hovering tree rows must preserve native toolbar button focus.
    await page.locator('#locate-tab-btn').focus();
    await page.locator('#nodeactive > .row').hover();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'locate-tab-btn');
    assert.equal(await page.locator('#sidebar-content').evaluate(el => getComputedStyle(el).filter), 'none');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.locator('#sidebar-content').evaluate(el => getComputedStyle(el).filter), 'none', 'Unfocused and hovered stays bright');
    await page.mouse.move(-10, -10);
    assert.equal(await page.locator('#sidebar-content').evaluate(el => getComputedStyle(el).filter), 'none', 'Unfocused and outside stays bright');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    assert.equal(await page.locator('#sidebar-content').evaluate(el => getComputedStyle(el).filter), 'grayscale(0.9)');
    assert.equal(await page.locator('#dup-count').evaluate(el => {
      for (let ancestor = el; ancestor; ancestor = ancestor.parentElement) {
        if (getComputedStyle(ancestor).filter !== 'none') return false;
      }
      return getComputedStyle(el).backgroundColor === 'rgb(217, 35, 54)';
    }), true, 'Dup badge stays red without any ancestor grayscale filter');
    assert.equal(await page.locator('#nodeactive .node-favicon').evaluate(el => getComputedStyle(el).filter), 'grayscale(1) brightness(0.65)');
    await page.locator('#locate-tab-btn').hover();
    assert.equal(await page.locator('#sidebar-content').evaluate(el => getComputedStyle(el).filter), 'none');
    assert.equal(await page.locator('#nodeactive .node-favicon').evaluate(el => getComputedStyle(el).filter), 'none');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => tree.cursor.id === 'active');

    // Exercise all four states for tree shortcuts, native button activation,
    // focus traversal, and text entry (not just the tree's key dispatcher).
    const setPanelState = async (focused, inside) => {
      if (inside) await page.locator('#locate-tab-btn').hover();
      else await page.mouse.move(-10, -10);
      await page.evaluate(focused => window.dispatchEvent(new Event(focused ? 'focus' : 'blur')), focused);
    };
    await page.evaluate(() => {
      window.locateClicks = 0;
      document.getElementById('locate-tab-btn').addEventListener('click', () => locateClicks++);
    });
    for (const [focused, inside] of [[false, false], [false, true], [true, false], [true, true]]) {
      const enabled = focused && inside;
      await page.evaluate(() => document.activeElement.blur());
      await reset('a');
      await setPanelState(focused, inside);
      await page.keyboard.press('Shift+ArrowDown'); await settle();
      assert.deepEqual(await marked(), enabled ? ['a', 'b'] : [], `Shortcut gate: focus=${focused}, inside=${inside}`);

      await page.locator('#locate-tab-btn').focus();
      await setPanelState(focused, inside);
      const before = await page.evaluate(() => locateClicks);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space'); await settle();
      assert.equal(await page.evaluate(() => locateClicks), before + (enabled ? 2 : 0), 'Native buttons obey the same gate');
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id === 'locate-tab-btn'), !enabled, 'Native focus traversal obeys the gate');

      await page.evaluate(() => {
        tree.$searchBar.classList.remove('hidden');
        tree.$searchEntry.value = '';
        tree.$searchEntry.focus();
      });
      await setPanelState(focused, inside);
      await page.keyboard.type('z');
      assert.equal(await page.locator('#search-entry').inputValue(), enabled ? 'z' : '', 'Native text entry obeys the gate');
      await page.evaluate(() => {
        tree.$searchEntry.blur();
        tree.$searchEntry.value = '';
        tree.$searchBar.classList.add('hidden');
      });
    }
    await setPanelState(true, true);
    await reset('active');
    await page.evaluate(() => tree.nodes.active.setMarked(true, { reason: 'userAction' }));

    for (const theme of ['tk-night', 'tk-day']) {
      await page.locator('#theme-variant').evaluate((el, theme) => { el.href = `/themes/${theme}.css`; }, theme);
      await page.setViewportSize({ width: 260, height: 640 });
      const button = await page.locator('#locate-tab-btn').boundingBox();
      assert.ok(button.x + button.width <= 260 && button.y < 20, 'Locator stays at top right');
      const options = await page.locator('#options-btn').boundingBox();
      assert.ok(options.x + options.width <= button.x, 'Options stays to the left of the crosshair');
      assert.ok(Math.abs(options.y - button.y) < 1);
      const primary = await page.locator('#view-scope-btn').boundingBox();
      const redo = await page.locator('#redo-btn').boundingBox();
      const flat = await page.locator('#flatten-lone-child-btn').boundingBox();
      assert.ok(primary.y > button.y && Math.abs(flat.y - redo.y) < 1 && flat.x > redo.x + redo.width && flat.x + flat.width <= 260,
        'Narrow sidebars keep Flat to the right of Undo/Redo below the utility buttons');
      const bottomButtons = await page.locator('#bottom-bar > .button').evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect();
        return { id: button.id, y: rect.y, right: rect.right, height: rect.height, fits: button.scrollWidth <= button.clientWidth };
      }));
      assert.ok(bottomButtons.every(b => Math.abs(b.y - bottomButtons[0].y) < 1 && b.fits), 'Bottom buttons fit a single row without clipped labels');
      assert.equal(bottomButtons.at(-1).id, 'backup-btn');
      assert.ok(bottomButtons.every(b => Math.abs(b.height - button.height) < 1), 'Top and bottom buttons share a consistent height');
      const markedControls = await page.locator('#marked-actions > *').evaluateAll(controls => controls.map(control => {
        const rect = control.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, fits: control.scrollWidth <= control.clientWidth };
      }));
      assert.ok(markedControls.every(control => control.left >= 0 && control.right <= 260 && control.fits), 'Marked-item count and both move buttons fit the narrow sidebar');
      assert.ok(markedControls.every(control => Math.abs(control.top - markedControls[0].top) < 1), 'Marked-item controls fit on one row at standard sidebar widths');
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const dupButton = await page.locator('#dup-btn').boundingBox();
      const badge = await page.locator('#dup-count').boundingBox();
      assert.ok(badge.x < dupButton.x && badge.x + badge.width > dupButton.x, 'Dup badge stays at the top-left corner when the toolbar wraps');
      assert.ok(badge.y < dupButton.y && badge.y + badge.height > dupButton.y);
      if (process.env.SCREENSHOT_DIR) {
        await fs.mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${theme}.png`) });
        await page.mouse.move(-10, -10);
        await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${theme}-pointer-away.png`) });
        await page.locator('#locate-tab-btn').hover();
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
    console.log('PASS: separate before/first-child move buttons, selection controls, range selection, live Dup count, active-tab reveal, move/drag/flatten undo and redo after tree changes, focus/pointer shading and keyboard gating, and both theme layouts');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
