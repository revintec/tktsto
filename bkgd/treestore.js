// bkgd/treestore.js: TreeStore class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { debug, log, warn, error } from '/common/common.js';
import { NodeStore } from './nodestore.js';
import { Tree } from '/common/tree.js';
import { IDB } from '/bkgd/idb.js';


export class TreeStore extends Tree {

  constructor (bkgd) {
    super(NodeStore);
    this.bkgd = bkgd;
    this.needsTutorial = false;
    this.db = new IDB();
    this.db.init();
  }

  async init () {
    super.init();
    // load the nodes from storage
    await this.loadTreeFromDB();
  }

  async loadTreeFromDB () {
    this.createRootNode();

    // try to load the root node by itself
    // if it doesn't exist in the DB, then save the root node
    // (to make sure root is the first node in the DB)
    const saved = await this.db.loadNode(this.root.id);
    if (! saved) {
      log(`TreeStore.createRootNode couldn't load root, fresh install?`);
      await this.db.saveNode(this.root);
      this.needsTutorial = true;
    }

    let nodeIds;

    // TODO: load latest snapshot if it's clean
    //const dirty = await api.storage.local.get(
    //  { isLatestSnapshotDirty: true });
    //if (! dirty) {
    //  console.time('db.loadCurrentSnapshot');
    //  nodeIds = await this.db.loadSnapshot('local');
    //  console.timeEnd('db.loadCurrentSnapshot');
    //} else
    {
      // load the slow way, one node at a time
      console.time('db.loadAllNodes');
      nodeIds = await this.db.loadAllNodes();
      console.timeEnd('db.loadAllNodes');
    }

    const numIds = Object.keys(nodeIds).length;
    debug(`loaded ${numIds} nodes`);
    if (! nodeIds['root'])
      return error(`loadTreeFromDB(): no root node in DB`);

    // restore session from serialized data
    console.time('TreeStore.rebuildNodeFromSerializedHash');
    const numLoaded = this.rebuildNodeFromSerializedHash(
      this.root, nodeIds);
    console.timeEnd('TreeStore.rebuildNodeFromSerializedHash');
    log(`loadTreeFromDB(): loaded ${numLoaded}/${numIds} nodes`);

    // Recover incomplete writes from older versions and persist repaired links.
    await this.reattachOrphanedNodes(nodeIds);

    // look for empty boring windows and delete them
    // (because Firefox, for some reason, keeps accumulating these)
    const boringEmptyWinNodes = this.root.findNodes(
      (n) => (n.isWindow()
        && (! n.hasKids())
        && (! n.shouldUnloadNotDelete())),
      (n) => true,
    );
    for (const toDelete of boringEmptyWinNodes) {
      debug(`delete boringEmptyWinNodes: ${toDelete.toLine()}`, toDelete);
      await toDelete.deleteSelf({ reason: 'emptyWindowClosed' });
    }
    // TODO: if lost+found exists with nothing inside, delete it too?
  }

  async reattachOrphanedNodes (nodeIds) {
    const remaining = new Set(Object.keys(nodeIds).filter(id => !this.nodes[id]));
    const seen = new Set(Object.keys(this.nodes));
    const attach = (id, parent) => {
      const node = new this.NodeClass(this, parent);
      node.id = id;
      parent.nodes.push(node);
      this.rebuildNodeFromSerializedHash(node, nodeIds, seen);
      for (const attachedId of seen) remaining.delete(attachedId);
    };
    let lostFound;
    while (remaining.size) {
      // A child record may have committed before its parent's child list.
      // Restore that link in place, including entire detached branches.
      let recovered = false;
      for (const id of remaining) {
        const parent = this.nodes[nodeIds[id].parent];
        if (parent) {
          attach(id, parent);
          recovered = true;
        }
      }
      if (recovered) continue;

      // Only use lost+found when no saved parent leads back to the tree.
      // Break an orphaned parent cycle at one node if necessary.
      if (!lostFound) {
        lostFound = this.root.nodes.find(n => n.label === 'lost+found');
        if (!lostFound) {
          lostFound = await this.root.addChild(0,
            { label: 'lost+found', note: 'orphaned nodes found during fsck' },
            { reason: 'reattachOrphanedNodes' });
          seen.add(lostFound.id);
        }
      }
      const id = [...remaining].find(id =>
        !nodeIds[nodeIds[id].parent] || nodeIds[id].parent === id)
        || remaining.values().next().value;
      warn('fsck: recovering branch under lost+found:', id);
      attach(id, lostFound);
    }

    // Also remove dangling child IDs and correct stale parent pointers in
    // already reachable nodes. Commit every repaired link in one transaction.
    const changed = Object.values(this.nodes).filter(node => {
      const saved = nodeIds[node.id];
      const current = node.toDict();
      return !saved || saved.parent !== current.parent
        || JSON.stringify(saved.nodes) !== JSON.stringify(current.nodes);
    });
    if (changed.length) await this.db.saveNodes(changed);
  }

}

