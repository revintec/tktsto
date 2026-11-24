const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

const extension = path.resolve(__dirname, '..');
const diagnosticPath = process.argv[2];
if (!diagnosticPath) throw new Error('Usage: node recovery/test-second-pass.cjs /path/to/live-diagnostic.json');

(async () => {
  const diagnostic = JSON.parse(await fs.readFile(diagnosticPath, 'utf8'));
  const firstPass = await fs.readFile(path.join(__dirname, 'reconnect-restored-tabs-latest.js'), 'utf8');
  const source = await fs.readFile(path.join(__dirname, 'deduplicate-after-recovery.js'), 'utf8');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'tktsto-second-pass-test-'));
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
        delete globalThis.tktstoRecovery; delete globalThis.tktstoDedup;
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
    const viewSource = await fs.readFile(path.join(extension, 'view/treeview.js'), 'utf8');
    const viewMethods = viewSource.slice(viewSource.indexOf('  dupUrlParse (url) {'), viewSource.indexOf('  // Flag duplicated nodes'));
    const sidebar = new (vm.runInNewContext('(class {' + viewMethods + '})', { URLSearchParams }))();
    const sidebarGroups = nodes => {
      const groups = new Map();
      for (const node of Object.values(nodes)) {
        if (!node.url || node.type === 'window') continue;
        const { base, params } = sidebar.dupUrlParse(node.url);
        if (!groups.has(base)) groups.set(base, []);
        groups.get(base).push({ node, params });
      }
      return [...groups.entries()].flatMap(([base, members]) => members.length < 2 ? []
        : sidebar.dupQueryClusters(members).map(cluster => ({ base, extraCopies: cluster.length - 1 })));
    };
    const install = async (script, name) => {
      await evaluate(script);
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(`!!globalThis.${name}?.version`)) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return evaluate(`${name}.preview()`);
    };
    const reset = async () => {
      await evaluate('resetFixture()');
      await install(firstPass, 'tktstoRecovery');
      await evaluate('tktstoRecovery.apply()');
      await evaluate('globalThis.firstHelper=tktstoRecovery;globalThis.beforeSecond=JSON.parse(JSON.stringify(fixtureBg.tree.serializeNodes()));globalThis.firstBackup=tktstoRecovery.backupKey');
    };
    await assert.rejects(() => install(source, 'tktstoDedup'), /Finish the first recovery/);
    assert.deepEqual(await evaluate('fixtureBg.tree.serializeNodes()'), diagnostic.nodes);
    await reset();
    const before = await evaluate('beforeSecond');
    const beforeDb = await evaluate('fixtureBg.tree.db.loadAllNodes()');
    assert.equal(sidebarGroups(before).reduce((sum, group) => sum + group.extraCopies, 0), 89);
    const stats = await install(source, 'tktstoDedup');
    if (!stats.canApply) console.log('SKIPPED', await evaluate('tktstoDedup.skipped'));
    assert.deepEqual(stats, { duplicateCountBefore: 89, duplicateCountAfter: 7, removedTreeEntries: 82,
      reconnectedLiveTabs: 28, liveTabs: 295, browserTabs: 296, remainingPink: 37,
      treeEntriesAfter: 952, preservedMokaEntries: 8, canApply: true });
    assert.deepEqual(await evaluate('fixtureBg.tree.serializeNodes()'), before);
    assert.deepEqual(await evaluate('fixtureBg.tree.db.loadAllNodes()'), beforeDb);
    assert.equal(await evaluate('tktstoRecovery===firstHelper&&tktstoRecovery.backupKey===firstBackup'), true);
    const matches = await evaluate('tktstoDedup.matches');
    console.log('PASS: both passes in sequence reproduce 89 -> 7; second preview is read-only; first helper and snapshot remain intact.');

    await evaluate('tktstoDedup.apply()');
    const after = await evaluate('fixtureBg.tree.serializeNodes()');
    const mapping = new Map(matches.map(row => [row.removed, row.retained]));
    assert.equal(Object.keys(after).length, 952);
    assert.equal(Object.keys(await evaluate('fixtureBg.tree.db.loadAllNodes()')).length, 952);
    for (const [id, node] of Object.entries(before)) {
      if (mapping.has(id)) { assert.equal(after[id], undefined); continue; }
      assert.ok(after[id], 'Preserve node ' + id);
      assert.equal(after[id].parent, mapping.get(node.parent) || node.parent, 'Preserve hierarchy ' + id);
      for (const key of ['label', 'note', 'checkbox', 'bookmark', 'ctime', 'url'])
        assert.deepEqual(after[id][key], node[key], 'Preserve ' + key + ' ' + id);
      for (const child of node.nodes.filter(child => !mapping.has(child)))
        assert.ok(after[id].nodes.includes(child), 'Preserve descendant ' + child);
    }
    for (const [removed, retained] of mapping)
      for (const child of before[removed].nodes.filter(child => !mapping.has(child)))
        assert.equal(after[child].parent, retained, 'Transfer saved child ' + child);
    const liveIds = nodes => Object.values(nodes).filter(n => n.loaded && n.url).map(n => n.tabId).sort((a, b) => a - b);
    assert.deepEqual(liveIds(after), liveIds(before));
    const mokaBefore = Object.values(before).filter(n => n.url?.startsWith('https://app.mokahr.com/apply/moonshot/148506#'));
    assert.equal(mokaBefore.length, 8);
    for (const node of mokaBefore) assert.deepEqual(after[node.id], node);
    assert.deepEqual(JSON.parse(JSON.stringify(sidebarGroups(after))), [{ base: 'https://app.mokahr.com/apply/moonshot/148506', extraCopies: 7 }]);
    assert.deepEqual(await evaluate('fixtureWindows'), diagnostic.browserWindows);
    assert.deepEqual(await evaluate('fixtureBg.tree.db.loadObj("Snapshots",tktstoDedup.backupKey).then(s=>s.nodes)'), before);
    await assert.rejects(() => evaluate('tktstoRecovery.undo()'), /tree has changed/);
    await assert.rejects(() => evaluate('tktstoDedup.apply()'), /already applied/);
    console.log('PASS: actual sidebar comparison yields only 7 Moka matches; all 295 live IDs and all eight Moka records retained; hierarchy, notes, descendants and snapshots verified.');
    await evaluate('tktstoDedup.undo()');
    assert.deepEqual(await evaluate('fixtureBg.tree.serializeNodes()'), before);
    assert.equal(await evaluate('tktstoRecovery.backupKey===firstBackup'), true);
    await evaluate('tktstoRecovery.undo()');
    assert.equal(await evaluate('Object.keys(fixtureBg.tree.nodes).length'), 1301);
    console.log('PASS: second undo returns exactly to the first-pass graph; first undo then succeeds.');

    await reset(); await install(source, 'tktstoDedup');
    const failureDb = await evaluate('fixtureBg.tree.db.loadAllNodes()');
    await evaluate('globalThis.originalDelete=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(...args){if(this.name==="Nodes")throw new Error("injected delete failure");return Reflect.apply(originalDelete,this,args)}');
    await assert.rejects(() => evaluate('tktstoDedup.apply()'), /injected delete failure/);
    await evaluate('IDBObjectStore.prototype.delete=originalDelete');
    assert.deepEqual(await evaluate('fixtureBg.tree.serializeNodes()'), before);
    assert.deepEqual(await evaluate('fixtureBg.tree.db.loadAllNodes()'), failureDb);
    assert.equal(await evaluate('tktstoDedup.backupKey'), null);
    assert.equal(await evaluate('tktstoDedup.busy'), false);
    console.log('PASS: failure after writes begin rolls back the entire second pass and releases locks.');

    for (const fault of ['both-live', 'conflicting-notes', 'url-changed', 'third-copy', 'ancestor']) {
      await reset();
      await worker.evaluate(fault => {
        const tree = fixtureBg.tree;
        const keep = tree.nodes['1m856bn96--mac'], remove = tree.nodes['1m854zsf9--mac'];
        if (fault === 'both-live') {
          const tab = fixtureWindows.flatMap(w => w.tabs).find(tab => tab.id === remove.tabId);
          Object.assign(keep, { loaded: true, wasLoaded: false, tabId: 999999, windowId: tab.windowId });
          fixtureWindows.find(w => w.id === tab.windowId).tabs.push({ ...tab, id: 999999, index: 999 });
        }
        if (fault === 'conflicting-notes') { keep.note = 'Keep saved note'; remove.note = 'Keep live note'; }
        if (fault === 'url-changed') keep.url += '#different';
        if (fault === 'third-copy') {
          const extra = new tree.NodeClass(tree, keep.parent);
          Object.assign(extra, { id: 'new-identical-copy', url: keep.url, loaded: false });
          keep.parent.nodes.push(extra); tree.nodes[extra.id] = extra;
        }
        if (fault === 'ancestor') {
          remove.parent.nodes = remove.parent.nodes.filter(n => n !== remove);
          keep.nodes.push(remove); remove.parent = keep;
        }
        globalThis.beforeBlocked = JSON.parse(JSON.stringify(tree.serializeNodes()));
      }, fault);
      await install(source, 'tktstoDedup');
      assert.equal(await evaluate('tktstoDedup.stats.canApply'), false);
      await assert.rejects(() => evaluate('tktstoDedup.apply()'), /before writes/);
      assert.deepEqual(await evaluate('fixtureBg.tree.serializeNodes()'), await evaluate('beforeBlocked'));
      assert.equal(await evaluate('tktstoDedup.backupKey'), null);
      console.log('PASS:', fault, 'keeps both copies and blocks the incomplete cleanup without writes.');
    }

    await reset();
    await worker.evaluate(() => {
      const tree = fixtureBg.tree, remove = tree.nodes['1m854zsf9--mac'];
      remove.note = 'New note added after first pass';
      const child = new tree.NodeClass(tree, remove);
      Object.assign(child, { id: 'new-child-to-preserve', label: 'Preserve this child', note: 'Saved child content' });
      remove.nodes.push(child); tree.nodes[child.id] = child;
    });
    await install(source, 'tktstoDedup');
    await evaluate('tktstoDedup.apply()');
    assert.equal(await evaluate('fixtureBg.tree.nodes["1m856bn96--mac"].note'), 'New note added after first pass');
    assert.equal(await evaluate('fixtureBg.tree.nodes["new-child-to-preserve"].parent.id'), '1m856bn96--mac');
    await evaluate('fixtureWindows[0].tabs[0].url+="#navigated"');
    await assert.rejects(() => evaluate('tktstoDedup.undo()'), /changed since/);
    assert.deepEqual(await evaluate('browserMutationCalls'), []);
    console.log('PASS: new compatible notes and children are retained; newer browser changes block undo; no browser mutation APIs called.');
  } finally {
    await cdp.send('Target.detachFromTarget', { sessionId });
    await context.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
