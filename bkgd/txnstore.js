// bkgd/txnstore.js: TxnStore class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { debug, log, warn, error } from '/common/common.js';


// TxnStore keeps an append-only log of changes to the tree, much like a
// revision history in git.  Each user change is recorded as a transaction
// (a "revision"); the log never rewrites history, so "undo" is just the
// inverse of an earlier revision replayed as a brand new revision.
//
// This all lives in the service worker: the TreeViews never touch the log
// directly, they merely ask the worker to record/undo/redo.  Because the
// worker owns the canonical tree, applying a revision here emits the usual
// tree_* events, which keeps every open view (and eventually every device)
// in sync.
//
// A revision looks like:
//   {
//     key:      sortable unique id (also the IDB keyPath)
//     when:     timestamp (ms)
//     clientId: which device created it (so a remote undo can be told apart)
//     action:   'edit' | 'undo' | 'redo'
//     op:       (for 'edit') the change + the data needed to invert it
//     target:   (for 'undo'/'redo') the key of the edit being reversed
//   }
export class TxnStore {

  constructor (bkgd) {
    this.bkgd = bkgd;
    // every revision, oldest-first
    this.revisions = [];
    // derived from the log by recomputeStacks()
    this.undoStack = [];   // edit keys available to undo, oldest-first
    this.redoStack = [];   // edit keys available to redo, oldest-first
    this.editsByKey = {};  // key -> edit revision
    // trim history older than this many days (0 disables trimming)
    this.maxAgeDays = 30;
  }

  get tree () { return this.bkgd.tree; }
  get db () { return this.bkgd.tree.db; }

  async init () {
    try {
      this.revisions = await this.db.loadAllTxns();
    } catch (err) {
      // e.g. an old database created before the Transactions store existed;
      // start fresh rather than breaking the worker
      warn('TxnStore.init() could not load revisions', err);
      this.revisions = [];
    }
    this.recomputeStacks();
    log(`TxnStore: loaded ${this.revisions.length} revisions`);
    // bound history growth without blocking startup
    this.maybeTrim();
  }

  // ---- the append-only log ----------------------------------------------

  // turn the flat list of revisions into undo/redo stacks.  Replaying the
  // log is what lets a fresh service worker (or a freshly synced device)
  // rebuild exactly the same undo state.
  recomputeStacks () {
    this.editsByKey = {};
    const undo = [];
    let redo = [];
    for (const rev of this.revisions) {
      if ('edit' === rev.action) {
        this.editsByKey[rev.key] = rev;
        undo.push(rev.key);
        redo = [];  // a fresh edit invalidates the redo history
      }
      else if ('undo' === rev.action) {
        if (! this.editsByKey[rev.target]) continue;  // target trimmed away
        const i = undo.lastIndexOf(rev.target);
        if (i >= 0) undo.splice(i, 1);
        redo.push(rev.target);
      }
      else if ('redo' === rev.action) {
        if (! this.editsByKey[rev.target]) continue;  // target trimmed away
        const i = redo.lastIndexOf(rev.target);
        if (i >= 0) redo.splice(i, 1);
        undo.push(rev.target);
      }
    }
    this.undoStack = undo;
    this.redoStack = redo;
  }

  canUndo () { return this.undoStack.length > 0; }
  canRedo () { return this.redoStack.length > 0; }

  undoState () {
    return { canUndo: this.canUndo(), canRedo: this.canRedo() };
  }

  // append a new revision to the log and persist it
  async append (rev) {
    rev.key = this.bkgd.idGen.newId();
    rev.when = Date.now();
    rev.clientId = this.bkgd.cfg.clientId;
    this.revisions.push(rev);
    await this.db.saveTxn(rev);
    this.recomputeStacks();
    return rev;
  }

  // ---- recording a user delete ------------------------------------------

  // perform a user-requested delete on the canonical tree and record it as
  // an undoable transaction.  style is 'whole' (delete the node and all of
  // its descendants) or 'promote' (delete just the node, lifting its kids
  // up to take its place).  Returns a short human label for the status bar.
  async recordDelete (node, style) {
    const parentId = node.parent.id;
    const index = node.indexOf();
    const label = node.toLine();
    const rootId = node.id;

    let op;
    if ('promote' === style) {
      const ownDict = node.toDict();
      const kidIds = node.nodes.map((k) => k.id);
      await node.deleteSelfAndPromoteKids({ reason: 'userAction' });
      op = { type: 'deletePromote', rootId, parentId, index, ownDict, kidIds, label };
    }
    else {  // 'whole'
      const dicts = node.serializeSubtree();
      await node.deleteSelf({ reason: 'userAction' });
      op = { type: 'deleteWhole', rootId, parentId, index, dicts, label };
    }

    await this.append({ action: 'edit', op });
    return { label };
  }

  // ---- undo / redo ------------------------------------------------------

  async undo () {
    if (! this.canUndo()) return { note: 'nothing to undo' };
    const key = this.undoStack[this.undoStack.length - 1];
    const edit = this.editsByKey[key];
    const toRoot = await this.applyInverse(edit.op);
    await this.append({ action: 'undo', target: key });
    const note = toRoot
      ? `restored ${edit.op.label} to root (original parent gone)`
      : `undid: delete ${edit.op.label}`;
    // tell the requesting view where to put its cursor (the restored node)
    return { note, cursorId: edit.op.rootId };
  }

  async redo () {
    if (! this.canRedo()) return { note: 'nothing to redo' };
    const key = this.redoStack[this.redoStack.length - 1];
    const edit = this.editsByKey[key];
    await this.applyForward(edit.op);
    await this.append({ action: 'redo', target: key });
    return { note: `redid: delete ${edit.op.label}` };
  }

  // re-do the original change (used by redo)
  async applyForward (op) {
    const node = this.tree.nodes[op.rootId];
    if (! node) return;
    if ('deletePromote' === op.type)
      await node.deleteSelfAndPromoteKids({ reason: 'userAction' });
    else
      await node.deleteSelf({ reason: 'userAction' });
  }

  // undo the original change (used by undo).  returns true if the node had
  // to be relocated to root because its original parent is gone.
  async applyInverse (op) {
    if ('deletePromote' === op.type)
      return this.restoreNodeAndAdopt(
        op.rootId, op.ownDict, op.parentId, op.index, op.kidIds);
    return this.restoreSubtree(op.rootId, op.dicts, op.parentId, op.index);
  }

  // ---- restoring deleted nodes ------------------------------------------

  // turn a serialized node dict back into addChild() details: a restored
  // node comes back unloaded, since its live tab (if any) is long gone
  restoreDetails (dict) {
    const details = { ...dict };
    delete details.parent;
    delete details.nodes;
    details.tabId = undefined;
    details.windowId = undefined;
    if (details.loaded) details.wasLoaded = true;
    details.loaded = false;
    details.active = false;
    return details;
  }

  // resolve where a restored node should go.  if its original parent is no
  // longer in the tree, fall back to appending at the end of root.  returns
  // toRoot=true when that fallback happened, so the caller can tell the user
  // rather than silently relocating the node.
  resolveRestoreParent (parentId, index) {
    let parent = this.tree.nodes[parentId];
    let toRoot = false;
    if (! parent) {
      parent = this.tree.root;
      index = parent.nodes.length;  // append at end of root
      toRoot = true;
    }
    return { parent, index, toRoot };
  }

  // rebuild a whole deleted subtree (from Node.serializeSubtree()) under
  // parentId at index, restoring each node's original id and order
  async restoreSubtree (rootId, dicts, parentId, index) {
    const { parent, index: at, toRoot } =
      this.resolveRestoreParent(parentId, index);
    await this.rebuildNode(rootId, dicts, parent, at);
    return toRoot;
  }

  async rebuildNode (id, dicts, parent, index) {
    const dict = dicts[id];
    if (! dict) return null;
    const newNode = await parent.addChild(
      index, this.restoreDetails(dict), { reason: 'userAction' });
    const childIds = dict.nodes || [];
    for (let i = 0; i < childIds.length; i++)
      await this.rebuildNode(childIds[i], dicts, newNode, i);
    return newNode;
  }

  // undo a "delete node, promote its kids" operation: recreate just the
  // node, then move its (still-alive) promoted kids back underneath it
  async restoreNodeAndAdopt (rootId, ownDict, parentId, index, kidIds) {
    const { parent, index: at, toRoot } =
      this.resolveRestoreParent(parentId, index);
    const newNode = await parent.addChild(
      at, this.restoreDetails(ownDict), { reason: 'userAction' });
    for (let i = 0; i < kidIds.length; i++) {
      const kid = this.tree.nodes[kidIds[i]];
      if (kid) await kid.moveTo(newNode, i, { reason: 'userAction' });
    }
    return toRoot;
  }

  // ---- trimming old history ---------------------------------------------

  // Keep the log from growing without bound: once history is older than
  // maxAgeDays (and, in a multi-device world, has been synced everywhere),
  // freeze the current tree into a snapshot and drop the stale revisions.
  // The snapshot becomes the authoritative base that the trimmed-away
  // revisions used to build up to.  Runs at most once a day.
  async maybeTrim () {
    if (! this.maxAgeDays) return;
    try {
      const cutoff = Date.now() - (this.maxAgeDays * 24 * 60 * 60 * 1000);

      // throttle: don't trim more than once per day
      const stored = await api.storage.local.get({ txnLastTrim: 0 });
      const dayMs = 24 * 60 * 60 * 1000;
      if (stored.txnLastTrim > (Date.now() - dayMs)) return;

      const stale = this.revisions.filter((r) => r.when < cutoff);
      if (! stale.length) {
        await api.storage.local.set({ txnLastTrim: Date.now() });
        return;
      }

      // freeze the current tree as the new history base
      // TODO: once devices sync, only trim revisions confirmed synced to all
      await this.db.saveSnapshot('local', this.tree.serializeNodes());

      for (const rev of stale) await this.db.deleteTxn(rev.key);
      this.revisions = this.revisions.filter((r) => r.when >= cutoff);
      this.recomputeStacks();
      await api.storage.local.set({ txnLastTrim: Date.now() });
      log(`TxnStore: trimmed ${stale.length} revisions older than ${this.maxAgeDays}d`);
    } catch (err) {
      warn('TxnStore.maybeTrim() failed', err);
    }
  }

}
