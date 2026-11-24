// Reconnect browser-restored windows which arrive after the startup merge.
// SPDX-License-Identifier: AGPL-3.0-or-later

import { api } from '/api.js';
import { emit, isNewTabPage, warn } from '/common/common.js';
import { mergeTabHistories } from '/common/node.js';

const storageKey = 'pendingBrowserRestore';
const tabKey = (url, pinned) => JSON.stringify([url, !!pinned]);

export class BrowserRestore {
  constructor (bkgd) {
    this.bkgd = bkgd;
    this.state = null;
    this.timer = null;
    this.activeEvents = 0;
    this.reconciling = null;
  }

  get token () { return this.state?.windows.length ? this.state.token : undefined; }

  wrapEvent (handler) {
    return async (...args) => {
      if (this.reconciling) await this.reconciling;
      this.activeEvents++;
      try { return await handler(...args); }
      finally { this.activeEvents--; }
    };
  }

  async init (sameBrowserSession) {
    if (sameBrowserSession) {
      try { this.state = (await api.storage.session.get(storageKey))[storageKey] || null; }
      catch { this.state = null; }
      return;
    }
    // Capture before the startup merge demotes missing tabs to wasLoaded.
    // Ordinary saved tabs, bookmarks, and windows closed before the crash
    // must not become candidates just because they have a matching URL.
    this.state = { token: crypto.randomUUID(), windows: [] };
    for (const win of this.bkgd.tree.root.findNodes(n => n.isWindow())) {
      const tabs = win.getLoadedTabs().filter(n => n.url && !n.isBookmark());
      if (!tabs.length) continue;
      this.state.windows.push({ id: win.id, incognito: !!win.incognito,
        tabs: tabs.map(n => ({ id: n.id, url: n.url, pinned: n.isPinned() })) });
    }
    await this.save(true);
  }

  async save (newBrowserSession = false) {
    // Survives service-worker suspension, but expires with the browser's IDs.
    try { await api.storage.session.set({ [storageKey]: this.state,
      ...(newBrowserSession ? { browserSessionStarted: Date.now() } : {}) }); }
    catch (err) { warn('Could not persist pending browser restoration', err); }
  }

  schedule () {
    if (!this.token) return;
    clearTimeout(this.timer);
    // Chrome can send window/tab/URL events in any order. Wait for the burst
    // to settle, and query the actual tabs instead of using stale event data.
    this.timer = setTimeout(() => {
      this.reconcile().catch(err => warn('Browser restoration failed', err));
    }, 300);
  }

  plan (saved, browserWindow, liveNodesByTab) {
    const tree = this.bkgd.tree;
    const target = tree.nodes[saved.id];
    if (!target?.isWindow() || !!browserWindow.incognito !== saved.incognito) return;
    if (target.isLoaded() && target.windowId !== browserWindow.id) return;
    const tabs = [...(browserWindow.tabs || [])].sort((a, b) => a.index - b.index);
    if (!tabs.length || tabs.length !== saved.tabs.length) return;
    // A blank/new-tab-only window is not enough evidence of restoration.
    if (!saved.tabs.some(t => t.url !== 'about:blank' && !isNewTabPage(t.url))) return;
    const tabIds = new Set(tabs.map(t => t.id));
    if (tabs.some(t => t.openerTabId && !tabIds.has(t.openerTabId))) return;
    const current = tree.root.getWindowId(browserWindow.id);
    if (!current || (current !== target && current.browserRestoreToken !== this.token)) return;

    // Exact URLs (including queries/fragments), pinned state, and multiplicity.
    // Queue repeated URLs in original tree order, never collapse two real tabs.
    const byUrl = new Map();
    for (const entry of saved.tabs) {
      const node = tree.nodes[entry.id];
      if (!node || node.getWindowNode() !== target || node.isBookmark()
        || node.url !== entry.url || node.isPinned() !== entry.pinned
        || (!node.isLoaded() && !node.wasLoaded)) return;
      if (node.isLoaded() && !tabIds.has(node.tabId)) return;
      const key = tabKey(entry.url, entry.pinned);
      if (!byUrl.has(key)) byUrl.set(key, []);
      byUrl.get(key).push(node);
    }
    const pairs = [];
    for (const tab of tabs) {
      const url = tree.getTabPendingUrl(tab);
      const queue = byUrl.get(tabKey(url, tab.pinned));
      if (!queue?.length) return;
      // Keep an attachment made by the startup merge where possible.
      const attached = queue.findIndex(n => n.isLoaded() && n.tabId === tab.id);
      const node = queue.splice(attached < 0 ? 0 : attached, 1)[0];
      pairs.push({ node, tab, url });
    }

    const originals = new Set(pairs.map(p => p.node));
    const removed = new Set();
    for (const tab of tabs) {
      const existing = liveNodesByTab.get(tab.id);
      if (existing && !originals.has(existing)) removed.add(existing);
    }
    if (current !== target) {
      removed.add(current);
      for (const node of current.findNodes()) removed.add(node);
    }
    // Only discard entries generated while this recovery was pending. Never
    // erase user notes, bookmarks, tasks, saved children, or older duplicates.
    for (const node of removed) {
      const automaticPinnedHeading = node.isPinnedBranch() && !node.url;
      if (originals.has(node) || node.browserRestoreToken !== this.token
        || node.note || node.hasCheckbox()
        || node.bookmark || node.marked || (node.label && !automaticPinnedHeading)
        || node.nodes.some(n => !removed.has(n))
        || (!node.isWindow() && !automaticPinnedHeading
          && (!node.isLoaded() || !tabIds.has(node.tabId)))) return;
    }
    return { saved, target, browserWindow, pairs, removed };
  }

  async reconcile () {
    clearTimeout(this.timer);
    await this.bkgd.treeLoaded;
    if (!this.token) return;
    // Do not take a snapshot halfway through an event handler. In particular,
    // an update may be waiting for a tab-created event to release the saved-tab
    // queue, so defer instead of blocking the remaining events of that burst.
    if (this.activeEvents || this.reconciling) { this.schedule(); return; }
    let finish;
    this.reconciling = new Promise(resolve => { finish = resolve; });
    const tree = this.bkgd.tree;
    const unlockMessages = await tree.onMessageMutex?.lock();
    const unlock = await tree.onTabCreatedMutex.lock();
    try {
      // An extension-initiated restore already has an explicit node queue.
      if (this.bkgd.nodesLoading.length || this.bkgd.windowsLoading.length) return;
      const windows = (await api.windows.getAll({ populate: true }))
        .filter(win => tree.trackBrowserWindow(win));
      if (this.bkgd.nodesLoading.length || this.bkgd.windowsLoading.length) return;
      const liveNodesByTab = new Map(Object.values(tree.nodes)
        .filter(n => n.isLoaded() && n.tabId !== undefined).map(n => [n.tabId, n]));
      const previousCount = this.state.windows.length;
      const plans = [];
      for (const win of windows) {
        const matches = this.state.windows
          .map(saved => this.plan(saved, win, liveNodesByTab)).filter(Boolean);
        if (matches.length === 1) plans.push(matches[0]);
      }
      // Ambiguity in either direction is a reason to leave the tree alone.
      const unique = plans.filter(p => plans.filter(q => q.target === p.target).length === 1);
      for (const plan of unique) {
        await this.attach(plan);
        this.state.windows = this.state.windows.filter(w => w.id !== plan.saved.id);
      }
      // Candidates deleted by the user can no longer be recovered.
      this.state.windows = this.state.windows.filter(w => tree.nodes[w.id]);
      if (this.state.windows.length !== previousCount) await this.save();
    } finally {
      unlock();
      unlockMessages?.();
      this.reconciling = null;
      finish();
    }
  }

  async attach ({ target, browserWindow: win, pairs, removed }) {
    const tree = this.bkgd.tree;
    const updates = new Map();
    updates.set(target, { windowId: win.id, loaded: true, wasLoaded: false,
      active: !!win.focused, incognito: !!win.incognito, windowState: win.state,
      geometry: [win.width, win.height, win.left, win.top], browserRestoreToken: undefined });
    for (const { node, tab, url } of pairs) {
      const changes = { tabId: tab.id, windowId: win.id, loaded: true, wasLoaded: false,
        active: !!tab.active, discarded: !!tab.discarded, frozen: tab.frozen,
        hidden: tab.hidden, incognito: !!tab.incognito, url, browserRestoreToken: undefined };
      if (tab.title) changes.title = tab.title.trim().replace(/\s+/g, ' ');
      const remembered = node.withTabHistory(changes);
      // A temporary restored entry may already have observed page/title
      // changes. Carry those into the original before deleting the duplicate.
      const temporary = [...removed].find(n => n.tabId === tab.id);
      if (temporary?.tabHistory?.length)
        remembered.tabHistory = mergeTabHistories(
          remembered.tabHistory || node.tabHistory, temporary.tabHistory);
      updates.set(node, remembered);
    }
    // Remove only temporary records; leave every original parent/child link,
    // note, label, checkbox, and saved descendant in place. No browser tabs
    // are opened, closed, or moved by this operation.
    const parents = new Set([...removed].map(n => n.parent).filter(n => !removed.has(n)));
    const before = new Map([...new Set([...updates.keys(), ...parents])]
      .map(n => [n, { dict: n.toDict(), nodes: [...n.nodes] }]));
    for (const [node, fields] of updates) Object.assign(node, fields);
    for (const parent of parents) parent.nodes = parent.nodes.filter(n => !removed.has(n));
    for (const node of removed) delete tree.nodes[node.id];
    try {
      // Attachments and deletion of temporary entries commit together.
      await tree.db.saveNodes([...before.keys()], [...removed].map(n => n.id));
    } catch (err) {
      for (const [node, original] of before) {
        node.fromDict(original.dict);
        node.nodes = original.nodes;
      }
      for (const node of removed) tree.nodes[node.id] = node;
      throw err;
    }
    for (const node of removed) node.parent = null;
    for (const { node } of pairs) {
      delete node.oldTabId;
      delete node.tabClosedReason;
    }
    await emit('tree_browserRestored', { windowId: win.id });
  }
}
