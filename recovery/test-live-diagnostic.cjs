const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

const extension = path.resolve(__dirname, '..');
const diagnosticPath = process.argv[2];
if (!diagnosticPath) throw new Error('Usage: node recovery/test-live-diagnostic.cjs /path/to/live-diagnostic.json');

(async () => {
  const diagnostic = JSON.parse(await fs.readFile(diagnosticPath, 'utf8'));
  const source = await fs.readFile(path.join(__dirname, 'reconnect-restored-tabs-latest.js'), 'utf8');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'tktsto-live-diagnostic-test-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_PATH || chromium.executablePath(), headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(() => typeof chrome);
  const cdp = await context.newCDPSession(await context.newPage());
  const target = (await cdp.send('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url === worker.url());
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let sequence = 0;
  const pending = new Map();
  cdp.on('Target.receivedMessageFromTarget', event => {
    const response = JSON.parse(event.message);
    if (response.id) { pending.get(response.id)?.(response); pending.delete(response.id); }
  });
  const send = async (method, params) => new Promise(async resolve => {
    const id = ++sequence; pending.set(id, resolve);
    await cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) });
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (response.error) throw new Error(JSON.stringify(response.error));
    if (response.result.exceptionDetails)
      throw new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text);
    return response.result.result.value;
  };
  const savedId = '1m84g10e2--mac', staleId = '1m854zfyy--mac';
  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const prototype = await send('Runtime.evaluate', { expression: 'Object.getPrototypeOf(async function(){})' });
    const objects = await send('Runtime.queryObjects', { prototypeObjectId: prototype.result.result.objectId });
    await send('Runtime.callFunctionOn', { objectId: objects.result.objects.objectId,
      functionDeclaration: 'function(){globalThis.realBg=this.find(f=>f.name==="emit"&&f.bkgd?.tree).bkgd;}' });
    await worker.evaluate(async diagnostic => {
      globalThis.fixtureDiagnostic = diagnostic;
      globalThis.browserMutationCalls = [];
      for (const [object, names] of [[chrome.tabs, ['create', 'remove', 'update', 'move', 'reload']],
        [chrome.windows, ['create', 'remove', 'update']]]) {
        for (const name of names) object[name] = async () => {
          browserMutationCalls.push(name); throw new Error('Unexpected browser mutation: ' + name);
        };
      }
      const Mutex = realBg.tree.onMessageMutex.constructor;
      globalThis.resetFixture = async () => {
        delete globalThis.tktstoRecovery;
        const bg = { treeLoaded: Promise.resolve(), nodesLoading: [], windowsLoading: [],
          tabReorderInProgress: false, idGen: realBg.idGen };
        const tree = new realBg.tree.constructor(bg); bg.tree = tree;
        tree.cfg = { clientId: 'mac' };
        tree.onMessageMutex = new Mutex(); tree.onTabCreatedMutex = new Mutex(); tree.onTabReplacedMutex = new Mutex();
        tree.resolveTreeLoaded();
        tree.rebuildNodeFromSerializedHash(tree.root, structuredClone(fixtureDiagnostic.nodes));
        for (const [id, details] of Object.entries(fixtureDiagnostic.runtimeDetails)) {
          if ('oldTabId' in details) tree.nodes[id].oldTabId = details.oldTabId;
          if ('tabClosedReason' in details) tree.nodes[id].tabClosedReason = details.tabClosedReason;
        }
        globalThis.fixtureBg = bg;
        globalThis.fixtureWindows = structuredClone(fixtureDiagnostic.browserWindows);
        chrome.windows.getAll = async () => structuredClone(fixtureWindows);
        const emit = async function emit() {}; emit.bkgd = bg; globalThis.temp1 = [emit];
        const db = await tree.db.db;
        await new Promise((resolve, reject) => {
          const tx = db.transaction(['Nodes', 'Snapshots'], 'readwrite');
          tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
          tx.objectStore('Nodes').clear(); tx.objectStore('Snapshots').clear();
          for (const node of Object.values(fixtureDiagnostic.databaseNodes))
            tx.objectStore('Nodes').put({ key: node.id, data: JSON.stringify(node) });
        });
        globalThis.originalFixture = JSON.parse(JSON.stringify(tree.serializeNodes()));
        globalThis.originalDatabase = await tree.db.loadAllNodes();
      };
      await resetFixture();
    }, diagnostic);
    const install = async () => {
      await evaluate(source);
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate('!!globalThis.tktstoRecovery?.version')) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      // Explicit preview awaits completion and propagates errors from the script.
      await evaluate('tktstoRecovery.preview()');
    };
    const reset = () => evaluate('resetFixture()');
    assert.deepEqual(await evaluate('originalFixture'), diagnostic.nodes, 'Use the exact live memory graph, including IDs');
    await install();
    assert.deepEqual(await evaluate('fixtureBg.tree.serializeNodes()'), diagnostic.nodes);
    assert.deepEqual(await evaluate('fixtureBg.tree.db.loadAllNodes()'), diagnostic.databaseNodes);
    const expectedStats = { reconnected: 263, skipped: 33, repairedIdentities: 0, savedStaleEntries: 1,
      browserTabs: 296, liveTabs: 295, remainingPink: 118, removedTreeEntries: 267 };
    assert.deepEqual(await evaluate('tktstoRecovery.stats'), expectedStats);
    assert.equal(await evaluate('tktstoRecovery.savedEntries[0].node'), staleId);
    console.log('PASS: exact live diagnostic preview is read-only:', JSON.stringify(expectedStats));

    const matches = await evaluate('tktstoRecovery.matches');
    await evaluate('tktstoRecovery.apply()');
    const after = await evaluate('fixtureBg.tree.serializeNodes()');
    const stored = await evaluate('fixtureBg.tree.db.loadAllNodes()');
    assert.equal(Object.keys(after).length, 1034);
    assert.equal(Object.keys(stored).length, 1034);
    const removed = new Set(matches.map(m => m.restored));
    for (const id of ['1m854z49m--mac', '1m854z49a--mac', '1m854z27q--mac', '1m854z49p--mac']) removed.add(id);
    for (const id of Object.keys(diagnostic.nodes)) if (!removed.has(id)) assert.ok(after[id], 'Preserve entry ' + id);
    for (const match of matches) {
      assert.equal(after[match.original].tabId, diagnostic.nodes[match.restored].tabId);
      for (const key of ['parent', 'label', 'note', 'checkbox', 'bookmark', 'expanded', 'ctime'])
        assert.deepEqual(after[match.original][key], diagnostic.nodes[match.original][key], 'Preserve ' + key);
    }
    const normalizedStale = { ...diagnostic.nodes[staleId], loaded: false, active: false, parent: '1kvwryyv4-01-mac' };
    delete normalizedStale.tabId; delete normalizedStale.windowId;
    assert.deepEqual(after[staleId], normalizedStale);
    assert.deepEqual(stored[staleId], normalizedStale);
    assert.deepEqual(after[savedId], diagnostic.nodes[savedId], 'Keep the original pink entry unchanged');
    const liveIds = nodes => Object.values(nodes).filter(n => n.loaded && n.url && Number.isInteger(n.tabId))
      .map(n => n.tabId).sort((a, b) => a - b);
    assert.deepEqual(liveIds(after), liveIds(diagnostic.nodes));
    assert.deepEqual(await evaluate('fixtureWindows'), diagnostic.browserWindows);
    assert.deepEqual(await evaluate('fixtureBg.tree.db.loadObj("Snapshots",tktstoRecovery.backupKey).then(s=>s.nodes)'), diagnostic.nodes);
    console.log('PASS: 263 original attachments restored; 295 tracked live IDs preserved; app window unchanged; stale and original saved links retained; raw snapshot verified.');

    await evaluate('tktstoRecovery.undo()');
    const undo = await evaluate('fixtureBg.tree.serializeNodes()');
    const expectedUndo = structuredClone(diagnostic.nodes);
    expectedUndo[staleId] = { ...normalizedStale, parent: diagnostic.nodes[staleId].parent };
    // Undo refreshes live attachments from Chrome; loaded windows no longer
    // carry the old, redundant wasLoaded marker.
    for (const node of Object.values(expectedUndo)) if (node.loaded) node.wasLoaded = false;
    for (const [id, node] of Object.entries(undo)) {
      for (const key of ['parent', 'nodes', 'url', 'label', 'note', 'loaded', 'wasLoaded', 'tabId', 'windowId'])
        assert.deepEqual(node[key], expectedUndo[id][key], 'Undo preserves ' + id + ' ' + key);
    }
    assert.equal(Object.keys(undo).length, 1301);
    assert.deepEqual(await evaluate('fixtureWindows'), diagnostic.browserWindows);
    console.log('PASS: undo restores the previous organization while keeping the stale entry saved and all real tabs open.');

    await reset(); await install();
    await evaluate('globalThis.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==="Nodes")throw new Error("injected write failure");return Reflect.apply(originalPut,this,args)}');
    await assert.rejects(() => evaluate('tktstoRecovery.apply()'), /injected write failure/);
    await evaluate('IDBObjectStore.prototype.put=originalPut');
    assert.deepEqual(await evaluate('fixtureBg.tree.serializeNodes()'), diagnostic.nodes);
    assert.deepEqual(await evaluate('fixtureBg.tree.db.loadAllNodes()'), diagnostic.databaseNodes);
    assert.equal(await evaluate('tktstoRecovery.backupKey'), null);
    assert.equal(await evaluate('tktstoRecovery.busy'), false);
    console.log('PASS: database failure rolls back the stale-state correction and cleanup together.');

    // Nearby cases must not activate the narrowly diagnosed exception.
    for (const fault of ['undefined-id', 'different-ctime', 'different-original-url', 'old-live-id',
      'pending-close', 'app-url-match', 'app-pending-match', 'unclaimed-normal-tab', 'other-null-id']) {
      await reset();
      await worker.evaluate(fault => {
        const tree = fixtureBg.tree, node = tree.nodes['1m854zfyy--mac'];
        if (fault === 'undefined-id') delete node.tabId;
        if (fault === 'different-ctime') node.ctime++;
        if (fault === 'different-original-url') tree.nodes['1m84g10e2--mac'].url += '#changed';
        if (fault === 'old-live-id') node.oldTabId = fixtureWindows[0].tabs[0].id;
        if (fault === 'pending-close') node.tabClosedReason = 'unload';
        if (fault === 'app-url-match') fixtureWindows.find(w => w.type === 'app').tabs[0].url = node.url;
        if (fault === 'app-pending-match') fixtureWindows.find(w => w.type === 'app').tabs[0].pendingUrl = node.url;
        if (fault === 'unclaimed-normal-tab') fixtureWindows[0].tabs.push({ ...fixtureWindows[0].tabs[0], id: 999999, url: 'about:blank#new' });
        if (fault === 'other-null-id') {
          const tab = fixtureWindows[0].tabs.shift();
          Object.values(tree.nodes).find(n => n.tabId === tab.id).tabId = null;
        }
        globalThis.beforeBlocked = JSON.parse(JSON.stringify(tree.serializeNodes()));
      }, fault);
      await assert.rejects(install, /Live tab identity needs review/);
      await assert.rejects(() => evaluate('tktstoRecovery.apply()'), /Live tab identity needs review/);
      assert.deepEqual(await evaluate('fixtureBg.tree.serializeNodes()'), await evaluate('beforeBlocked'));
      assert.deepEqual(await evaluate('fixtureBg.tree.db.loadAllNodes()'), diagnostic.databaseNodes);
      assert.equal(await evaluate('tktstoRecovery.backupKey'), null);
      console.log('PASS:', fault, 'blocks without writes.');
    }
    // If this page has been reopened with one exact unclaimed match, use the
    // real tab rather than demoting it based on the previous diagnostic.
    await reset();
    await evaluate('fixtureWindows.find(w=>w.id===217810058).tabs.push({id:999999,windowId:217810058,url:fixtureBg.tree.nodes["1m854zfyy--mac"].url,pinned:false,incognito:false,index:142})');
    await install();
    assert.equal(await evaluate('tktstoRecovery.stats.reconnected'), 264);
    assert.equal(await evaluate('tktstoRecovery.stats.repairedIdentities'), 1);
    assert.equal(await evaluate('tktstoRecovery.stats.savedStaleEntries'), 0);
    await evaluate('tktstoRecovery.apply()');
    assert.equal(await evaluate('fixtureBg.tree.nodes["1m84g10e2--mac"].tabId'), 999999);
    assert.deepEqual(await evaluate('browserMutationCalls'), []);
    console.log('PASS: a newly reopened exact match is reattached using current Chrome evidence; no browser mutation APIs called.');
  } finally {
    await cdp.send('Target.detachFromTarget', { sessionId });
    await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
