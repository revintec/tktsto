// bkgd/nodestore.js: NodeStore class
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { debug, log, warn, error } from '/common/common.js';
import { Node } from '/common/node.js';
import { Mutex } from '/common/mutex.js';


// TODO
export class NodeStore extends Node {

  constructor (...args) {
    super(...args);
    // don't write other things during the middle of a transaction
    this.writeLock = new Mutex();
  }

  newNodeId () {
    // NodeView.newNodeId() and NodeStore.newNodeId()
    // are totally different, and Node.newNodeId() doesn't exist
    //super.newNodeId();  // unnecessary, doesn't exist
    const nodeId = this.tree.bkgd.idGen.newId();
    debug(`NodeStore.newNodeId(): ${nodeId}`);
    return nodeId;
  }

  async saveIfChanged (promise) {
    const changed = await promise;
    if (changed) {
      const unlock = await this.writeLock.lock();
      try { await this.persistStructure([this]); }
      finally { unlock(); }
    }
    return changed;
  }

  persistStructure (nodes, deletedIds = []) {
    // A delayed field update must not recreate a node that was deleted while
    // its notification or write lock was pending.
    const liveNodes = nodes.filter(node => node && this.tree.nodes[node.id] === node);
    if (!liveNodes.length && !deletedIds.length) return Promise.resolve();
    return this.tree.db.saveNodes(liveNodes, deletedIds);
  }

  async addChild (index, details, ...extra) {
    // index is required; assume 1st child if not given
    if (undefined === index) index = 0;

    debug(`NodeStore.addChild(${index})`, details);
    // must allocate ID before creating node and emitting notifications
    if (! details.id) { details.id = this.newNodeId(); }

    // create new Node object
    return await super.addChild(index, details, ...extra);
  }

  async setNotes (label, note, args) {
    debug(`NodeStore.setNotes(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.setNotes(label, note, args));
  }

  async setCheckbox (value, args) {
    debug(`NodeStore.setCheckbox(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.setCheckbox(value, args));
  }

  async updateCheckboxes () {
    debug(`NodeStore.updateCheckboxes(${this.id})`);

    // save checkbox states before
    const parents = [];
    let node = this;
    while (! node.isRoot()) {
      parents.push([node, node.checkbox, node.checkboxPx]);
      node = node.parent;
    }

    const changed = await super.updateCheckboxes();
    if (changed) {
      const unlock = await this.writeLock.lock();
      try {
        // if any parents changed, save them too
        const changedParents = parents.filter(([n, checkbox, checkboxPx]) =>
          (n.checkbox !== checkbox) || (n.checkboxPx !== checkboxPx));
        await this.persistStructure(changedParents.map(([n]) => n));
      }
      finally { unlock(); }
    }

    return changed;
  }

  async setTabFields (changes, args) {
    debug(`NodeStore.setTabFields(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.setTabFields(changes, args));
  }

  async load (args) {
    debug(`NodeStore.load(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.load(args));
  }

  async unload (args) {
    debug(`NodeStore.unload(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.unload(args));
  }

  async setExpanded (expanded, args) {
    debug(`NodeStore.setExpanded(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.setExpanded(expanded, args));
  }

  async setMarked (marked, args) {
    debug(`NodeStore.setMarked(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.setMarked(marked, args));
  }

  async setActive (active, args) {
    debug(`NodeStore.setActive(${args.reason}, ${this.id})`, args);
    return await this.saveIfChanged(super.setActive(active, args));
  }

}

