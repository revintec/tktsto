const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const harness = require('./structure-test-harness.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const payload = node => { const n = clone(node); delete n.parent; delete n.nodes; return n; };
(async () => {
  const [diagnosticPath, latestPath, baselinePath] = process.argv.slice(2);
  assert(baselinePath, 'Usage: node test-structure-recovery.cjs diagnostic.json latest.json baseline.json');
  const [diagnostic, latest, baseline] = await Promise.all([diagnosticPath, latestPath, baselinePath].map(async p => JSON.parse(await fs.readFile(p, 'utf8'))));
  const [first, second, source] = await Promise.all(['reconnect-restored-tabs-latest.js','deduplicate-after-recovery.js','restore-order-and-structure.js'].map(p => fs.readFile(path.join(__dirname,p),'utf8')));
  const h = await harness(), { ev, worker, install } = h;
  try {
    await worker.evaluate(async ({ diagnostic, latest }) => {
      globalThis.fixtureDiagnostic = diagnostic; globalThis.fixtureLatest = latest;
      const Mutex = realBg.tree.onMessageMutex.constructor;
      const bg = { treeLoaded: Promise.resolve(), nodesLoading: [], windowsLoading: [], tabReorderInProgress: false, idGen: realBg.idGen };
      const tree = new realBg.tree.constructor(bg); bg.tree = tree;
      tree.cfg = { clientId: 'mac' };
      tree.onMessageMutex = new Mutex(); tree.onTabCreatedMutex = new Mutex(); tree.onTabReplacedMutex = new Mutex();
      tree.resolveTreeLoaded(); tree.rebuildNodeFromSerializedHash(tree.root, structuredClone(diagnostic.nodes));
      for (const [id, details] of Object.entries(diagnostic.runtimeDetails)) {
        if ('oldTabId' in details) tree.nodes[id].oldTabId = details.oldTabId;
        if ('tabClosedReason' in details) tree.nodes[id].tabClosedReason = details.tabClosedReason;
      }
      globalThis.fixtureBg = bg; globalThis.fixtureWindows = structuredClone(diagnostic.browserWindows);
      chrome.windows.getAll = async () => structuredClone(fixtureWindows);
      const emit = async function emit() {}; emit.bkgd = bg; globalThis.temp1 = [emit];
      globalThis.mutationCalls = [];
      for (const [object, names] of [[chrome.tabs, ['create','remove','update','reload']], [chrome.windows, ['create','remove','update']]])
        for (const name of names) object[name] = async () => { mutationCalls.push(name); throw Error('Forbidden mutation ' + name); };
      globalThis.listeners = new Set();
      chrome.tabs.onMoved.addListener = f => listeners.add(f); chrome.tabs.onMoved.removeListener = f => listeners.delete(f);
      globalThis.moveCalls = 0; globalThis.failAtMove = 0; globalThis.failAllMoves = false;
      chrome.tabs.move = async (id, { windowId, index }) => {
        moveCalls++;
        if (failAllMoves || moveCalls === failAtMove) throw Error('injected Chrome move failure');
        if (!fixtureBg.tabReorderInProgress || fixtureBg.tabReorderStalled) throw Error('TKTSTO event flag not set');
        const win = fixtureWindows.find(w => w.id === windowId), from = win.tabs.findIndex(t => t.id === id);
        if (from < 0) throw Error('Unexpected cross-window move');
        const [tab] = win.tabs.splice(from, 1); win.tabs.splice(index, 0, tab);
        win.tabs.forEach((t,i) => { t.index = i; });
        setTimeout(() => { for (const f of listeners) f(id, { windowId, fromIndex: from, toIndex: index }); }, 0);
        return structuredClone(tab);
      };
      globalThis.saveFixture = async () => {
        const db = await tree.db.db;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['Nodes','Snapshots'],'readwrite'); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
          tx.objectStore('Nodes').clear(); tx.objectStore('Snapshots').clear();
          for (const node of Object.values(tree.serializeNodes())) tx.objectStore('Nodes').put({key:node.id,data:JSON.stringify(node)});
        });
      };
      await saveFixture();
    }, { diagnostic, latest });
    await install(first, 'tktstoRecovery'); await ev('tktstoRecovery.apply()');
    await install(second, 'tktstoDedup'); await ev('tktstoDedup.apply()');
    await worker.evaluate(async () => {
      const tree = fixtureBg.tree, current = tree.serializeNodes(), raw = structuredClone(fixtureLatest.nodes);
      for (const [id, node] of Object.entries(raw)) {
        if (node.loaded) for (const field of ['tabId','windowId']) if (current[id][field] !== undefined) node[field] = current[id][field];
      }
      tree.createRootNode(); tree.rebuildNodeFromSerializedHash(tree.root, raw);
      globalThis.baseRaw = JSON.parse(JSON.stringify(tree.serializeNodes()));
      globalThis.baseWindows = structuredClone(fixtureWindows);
      globalThis.firstHelper = tktstoRecovery; globalThis.secondHelper = tktstoDedup;
      globalThis.resetStructure = async () => {
        delete globalThis.tktstoStructure; tree.createRootNode(); tree.rebuildNodeFromSerializedHash(tree.root, structuredClone(baseRaw));
        fixtureWindows = structuredClone(baseWindows); moveCalls = 0; failAtMove = 0; failAllMoves = false;
        await saveFixture();
      };
      await resetStructure();
    });
    const before = await ev('fixtureBg.tree.serializeNodes()');
    const beforeDB = await ev('fixtureBg.tree.db.loadAllNodes()');
    const stats = await install(source, 'tktstoStructure');
    console.log('Preview:', stats);
    assert.equal(stats.treeEntries, 952); assert.equal(stats.matchedHistorical, 950);
    assert.equal(stats.changedParents, 42); assert.equal(stats.changedChildLists, 15);
    assert.equal(stats.missingHistorical, 1); assert.equal(stats.preservedLaterEntries, 2); assert.equal(stats.liveTabs, 295);
    assert.deepEqual(await ev('fixtureBg.tree.serializeNodes()'), before);
    assert.deepEqual(await ev('fixtureBg.tree.db.loadAllNodes()'), beforeDB);
    assert.equal(await ev('moveCalls'), 0);
    await ev('tktstoStructure.apply()');
    const after = await ev('fixtureBg.tree.serializeNodes()');
    const treeDB = await ev('fixtureBg.tree.db.loadAllNodes()');
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    for (const [id,node] of Object.entries(before)) assert.deepEqual(payload(after[id]), payload(node), 'All page data preserved at '+id);
    for (const [id,node] of Object.entries(after)) {
      assert.equal(treeDB[id].parent, node.parent); assert.deepEqual(treeDB[id].nodes, node.nodes);
    }
    // Independent semantic oracle: use URLs from the original backup, never the manifest mapping.
    const excluded = new Set(['1m854z49m--mac','1m854z49a--mac','1m854z27q--mac','1m854z49p--mac']);
    const historical = [];
    const visit = id => { if (excluded.has(id)) return; historical.push(baseline.nodes[id]); for (const child of baseline.nodes[id].nodes || []) visit(child); };
    visit('root');
    const byUrl = new Map(Object.values(after).filter(n => n.url).map(n => [n.url,n.id]));
    const map = n => n.url ? byUrl.get(n.url) : after[n.id] && n.id;
    const mapped = new Set(historical.map(map).filter(Boolean));
    for (const old of historical) {
      const id = map(old); if (!id) continue;
      assert.equal(after[id].parent, map(baseline.nodes[old.parent]), 'Historical parent by full URL '+id);
      assert.deepEqual(after[id].nodes.filter(child => mapped.has(child)),
        (old.nodes || []).map(child => baseline.nodes[child]).filter(n => !excluded.has(n.id)).map(map).filter(Boolean), 'Historical sibling order by full URL '+id);
    }
    assert.deepEqual(after['1m856bqzh--mac'].nodes, []);
    assert.equal(after['1m854zhj7--mac'].nodes.length, 12);
    assert.equal(after['1m7s4kryv--mac'].nodes.length, 2);
    assert.equal(await ev('tktstoRecovery===firstHelper && tktstoDedup===secondHelper'), true);
    assert.equal(await ev('listeners.size'), 0);
    console.log('PASS: exact 07:25 backup repaired to historical topology by full URL; all 952 payloads/295 live IDs retained; IndexedDB agrees.');
    await ev('tktstoStructure.undo()');
    assert.deepEqual(await ev('fixtureBg.tree.serializeNodes()'), before);
    assert.deepEqual(await ev('fixtureWindows'), await ev('baseWindows'));
    console.log('PASS: undo restores exact prior tree and browser order.');
    await ev('tktstoStructure.preview()'); await ev('tktstoStructure.apply()');
    await ev('fixtureBg.tree.loadTreeFromDB()');
    const reloaded = await ev('fixtureBg.tree.serializeNodes()');
    assert.equal(Object.keys(reloaded).length,951);
    assert.equal(reloaded['1m856bqzh--mac'],undefined);
    for (const [id,node] of Object.entries(after)) if(node.url) assert.deepEqual(reloaded[id],node);
    assert.deepEqual(reloaded.root.nodes,after.root.nodes.filter(id=>id!=='1m856bqzh--mac'));
    console.log('PASS: extension reload prunes only the now-empty unannotated window; every page and its repaired structure survives.');

    const reset = async () => { await ev('resetStructure()'); await install(source, 'tktstoStructure'); };
    await reset();
    await ev('fixtureBg.tree.nodes["1m856bfxw--mac"].note="New note after preview"');
    await assert.rejects(() => ev('tktstoStructure.apply()'), /since preview/);
    assert.equal(await ev('moveCalls'), 0);
    await ev('tktstoStructure.preview()'); await ev('tktstoStructure.apply()');
    assert.equal(await ev('fixtureBg.tree.nodes["1m856bfxw--mac"].note'), 'New note after preview');
    await ev('fixtureBg.tree.nodes["1m856bfxw--mac"].note="Newer note after apply"');
    await assert.rejects(() => ev('tktstoStructure.undo()'), /changed since apply/);
    console.log('PASS: stale preview/undo refuse newer work; re-preview preserves new notes.');

    await reset();
    await ev('globalThis.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==="Snapshots")throw Error("injected snapshot failure");return Reflect.apply(originalPut,this,args)}');
    await assert.rejects(() => ev('tktstoStructure.apply()'), /injected snapshot failure/);
    await ev('IDBObjectStore.prototype.put=originalPut');
    assert.equal(await ev('moveCalls'),0);
    assert.deepEqual(await ev('fixtureBg.tree.serializeNodes()'),before);
    console.log('PASS: snapshot failure stops before any Chrome move or tree write.');

    await reset(); await ev('failAtMove=3');
    await assert.rejects(() => ev('tktstoStructure.apply()'), /injected Chrome move failure/);
    assert.deepEqual(await ev('fixtureWindows'), await ev('baseWindows'));
    assert.deepEqual(await ev('fixtureBg.tree.serializeNodes()'), before);
    assert.deepEqual(await ev('fixtureBg.tree.db.loadAllNodes()'), beforeDB);
    assert.equal(await ev('tktstoStructure.busy'), false);
    console.log('PASS: partial Chrome move failure compensates before tree commit.');

    await reset();
    await ev('globalThis.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==="Nodes")throw Error("injected Nodes failure");return Reflect.apply(originalPut,this,args)}');
    await assert.rejects(() => ev('tktstoStructure.apply()'), /injected Nodes failure/);
    await ev('IDBObjectStore.prototype.put=originalPut');
    assert.deepEqual(await ev('fixtureWindows'), await ev('baseWindows'));
    assert.deepEqual(await ev('fixtureBg.tree.serializeNodes()'), before);
    assert.deepEqual(await ev('fixtureBg.tree.db.loadAllNodes()'), beforeDB);
    console.log('PASS: DB failure restores Chrome order with unchanged memory/DB tree.');

    await reset(); await ev('tktstoStructure.apply()');
    const appliedWindows = await ev('fixtureWindows'), appliedTree = await ev('fixtureBg.tree.serializeNodes()');
    await ev('IDBObjectStore.prototype.put=function(...args){if(this.name==="Nodes")throw Error("injected undo failure");return Reflect.apply(originalPut,this,args)}');
    await assert.rejects(() => ev('tktstoStructure.undo()'), /injected undo failure/);
    await ev('IDBObjectStore.prototype.put=originalPut');
    assert.deepEqual(await ev('fixtureWindows'),appliedWindows);
    assert.deepEqual(await ev('fixtureBg.tree.serializeNodes()'),appliedTree);
    await ev('tktstoStructure.undo()');
    assert.deepEqual(await ev('fixtureWindows'),await ev('baseWindows'));
    console.log('PASS: failed undo compensates back to applied order; retrying undo succeeds.');

    await reset();
    await ev('IDBObjectStore.prototype.put=function(...args){if(this.name==="Nodes"){failAllMoves=true;throw Error("injected rollback failure")}return Reflect.apply(originalPut,this,args)}');
    await assert.rejects(() => ev('tktstoStructure.apply()'), /injected rollback failure/);
    assert.equal(await ev('tktstoStructure.pendingBrowserRollback'), true);
    const pendingKey = await ev('tktstoStructure.backupKey');
    await ev('IDBObjectStore.prototype.put=originalPut;failAllMoves=false;delete globalThis.tktstoStructure');
    await install(source, 'tktstoStructure');
    await ev(`tktstoStructure.resume(${JSON.stringify(pendingKey)})`);
    await ev('tktstoStructure.retryBrowserRollback()');
    assert.deepEqual(await ev('fixtureWindows'), await ev('baseWindows'));
    assert.deepEqual(await ev('fixtureBg.tree.serializeNodes()'), before);
    assert.equal(await ev('tktstoStructure.pendingBrowserRollback'), false);
    console.log('PASS: incomplete compensation retained in durable snapshot; reinstall/resume/retry recovers original order.');

    for (const fault of ['missing-parent','ambiguous','pinned','grouped']) {
      await ev('resetStructure()');
      await worker.evaluate(fault => {
        const tree = fixtureBg.tree;
        const remove = id => { const n=tree.nodes[id]; n.parent.nodes=n.parent.nodes.filter(x=>x!==n); for (const c of n.nodes) { c.parent=n.parent;n.parent.nodes.push(c); } delete tree.nodes[id]; };
        if (fault==='missing-parent') { const n=tree.nodes['1m0f0a1e9--mac']; n.url += '#changed'; }
        if (fault==='ambiguous') {
          const n=tree.nodes['1m856bfxw--mac']; const target=tree.nodes['1m0f0a1e9--mac']; target.id;
          for (const id of ['duplicate-a','duplicate-b']) {
            const copy=new tree.NodeClass(tree,n.parent);copy.id=id;copy.url=target.url;n.parent.nodes.push(copy);tree.nodes[id]=copy;
          }
          remove(target.id);
        }
        if (fault==='pinned') fixtureWindows.find(w=>w.id===217810058).tabs[0].pinned=true;
        if (fault==='grouped') fixtureWindows.find(w=>w.id===217810058).tabs[0].groupId=1;
      }, fault);
      await assert.rejects(() => install(source,'tktstoStructure'), /absent but child|Ambiguous|pinned state|tab groups/);
      assert.equal(await ev('moveCalls'),0);
      console.log('PASS:',fault,'blocks before writes.');
    }
    await ev('resetStructure()');
    await worker.evaluate(() => {
      const tree=fixtureBg.tree, p=tree.nodes['1m854zhj7--mac'];
      for (const [id,url] of [['new-note-child',undefined],['new-same-url',p.url]]) {
        const node=new tree.NodeClass(tree,p); Object.assign(node,{id,url,note:'Retain later child'});p.nodes.push(node);tree.nodes[id]=node;
      }
      globalThis.newBefore=JSON.parse(JSON.stringify(tree.serializeNodes()));
    });
    await install(source,'tktstoStructure'); await ev('tktstoStructure.apply()');
    assert.deepEqual(await ev('fixtureBg.tree.nodes["1m854zhj7--mac"].nodes.slice(-2).map(n=>n.id)'), ['new-note-child','new-same-url']);
    assert.equal(await ev('fixtureBg.tree.nodes["new-same-url"].note'),'Retain later child');
    assert.equal(await ev('Object.keys(fixtureBg.tree.nodes).length'),954);
    console.log('PASS: later descendants and a same-URL entry retained separately; preferred verified identity remains unambiguous.');
    assert.deepEqual(await ev('mutationCalls'),[]);
    await fs.writeFile(path.join(__dirname,'audit-2026-11-24','structure-test-result.json'),JSON.stringify({stats,semanticOracle:'05:30 original tree by full URL',testsPassed:true},null,2)+'\n');
  } finally { await h.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
