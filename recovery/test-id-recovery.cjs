const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const extension = path.resolve(__dirname, '..');
const backupPath = process.argv[2];
if (!backupPath) throw new Error('Usage: node recovery/test-reconnect-restored-tabs.cjs /path/to/backup.json');
(async () => {
 const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
 const source = await fs.readFile(extension + '/recovery/reconnect-restored-tabs-latest.js', 'utf8');
 const manifest = vm.runInNewContext(source.match(/const GROUPS = \/\* RECOVERY_MANIFEST \*\/ ([\s\S]*?);\n  const assert/)[1]);
 const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'tktsto-recovery-test-'));
 const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
 });
 const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
 await worker.evaluate(() => typeof chrome);
 const cdp = await context.newCDPSession(await context.newPage());
 const target = (await cdp.send('Target.getTargets')).targetInfos.find(x => x.type === 'service_worker' && x.url === worker.url());
 const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
 let seq = 0; const pending = new Map();
 cdp.on('Target.receivedMessageFromTarget', event => { const m = JSON.parse(event.message); if (m.id) pending.get(m.id)?.(m); });
 const send = async (method, params) => new Promise(async resolve => { const id = ++seq; pending.set(id, resolve); await cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }); });
 const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true });
  if (result.result?.exceptionDetails) throw new Error(result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text);
  return result.result.result.value;
 };
 try {
  await new Promise(r => setTimeout(r, 1000));
  const proto = await send('Runtime.evaluate', { expression: 'Object.getPrototypeOf(async function(){})' });
  const objects = await send('Runtime.queryObjects', { prototypeObjectId: proto.result.result.objectId });
  await send('Runtime.callFunctionOn', { objectId: objects.result.objects.objectId, functionDeclaration: 'function(){ globalThis.temp1=this; globalThis.realBg=this.find(f=>f.name==="emit" && f.bkgd?.tree).bkgd; }' });
  // Install fixtures without opening any URLs from the user's backup.
  await worker.evaluate(async ({backup,manifest}) => {
   globalThis.fixtureBackup=backup;globalThis.fixtureManifest=manifest;
   globalThis.browserMutationCalls=[];
   for(const [object,names] of [[chrome.tabs,['create','remove','update','move','reload']],[chrome.windows,['create','remove','update']]]){
    for(const name of names)object[name]=async()=>{browserMutationCalls.push(name);throw new Error('Unexpected browser mutation: '+name);};
   }
   const Mutex=realBg.tree.onMessageMutex.constructor;
   globalThis.resetFixture=async()=>{
    delete globalThis.tktstoRecovery;
    const bg={treeLoaded:Promise.resolve(),nodesLoading:[],windowsLoading:[],tabReorderInProgress:false,idGen:realBg.idGen};
    const tree=new realBg.tree.constructor(bg);bg.tree=tree;
    tree.cfg={clientId:'mac'};tree.onMessageMutex=new Mutex();tree.onTabCreatedMutex=new Mutex();tree.onTabReplacedMutex=new Mutex();
    tree.resolveTreeLoaded();
    tree.rebuildNodeFromSerializedHash(tree.root,structuredClone(fixtureBackup.nodes));
    let wid=40,tid=500;
    const windows=[];
    for(const group of fixtureManifest){
     const win=tree.nodes[group.restoredWindow];win.windowId=++wid;
     const realWin={id:wid,type:'normal',incognito:false,focused:wid===41,state:'normal',width:1200,height:900,left:0,top:0,tabs:[]};
     for(const node of win.findNodes(n=>!!n.url)){
      node.tabId=++tid;node.windowId=wid;
      realWin.tabs.push({id:tid,windowId:wid,url:node.url,title:node.title,index:realWin.tabs.length,active:realWin.tabs.length===0,pinned:false,incognito:false,discarded:false});
     }
     windows.push(realWin);
    }
    globalThis.fixtureBg=bg;globalThis.fixtureWindows=windows;
    chrome.windows.getAll=async()=>structuredClone(fixtureWindows);
    const emit=async function emit(){};emit.bkgd=bg;globalThis.temp1=[emit];
    const db=await tree.db.db;
    await new Promise((resolve,reject)=>{const tx=db.transaction(['Nodes','Snapshots'],'readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);tx.objectStore('Nodes').clear();tx.objectStore('Snapshots').clear();for(const node of Object.values(tree.nodes))tx.objectStore('Nodes').put({key:node.id,data:JSON.stringify(node.toDict())});});
    globalThis.originalFixture=JSON.parse(JSON.stringify(tree.serializeNodes()));
   };
   await resetFixture();
  }, { backup, manifest });
  const install = async () => {
   await evaluate(source);
   for(let i=0;i<100;i++){
    if(await evaluate('!!globalThis.tktstoRecovery?.summary'))return;
    await new Promise(r=>setTimeout(r,20));
   }
   throw new Error('Preview did not finish');
  };
  const reset = () => evaluate('resetFixture()');
  const nodeId=manifest[1].pairs.find(pair=>pair[1]==='1m854zfyy--mac')[1];
  const targetId=manifest[1].pairs.find(pair=>pair[1]===nodeId)[0];
  await evaluate(`globalThis.problemNodeId=${JSON.stringify(nodeId)};globalThis.problemTargetId=${JSON.stringify(targetId)}`);
  // Missing, non-numeric, stale and duplicated IDs must reconnect only to
  // Chrome's unique unclaimed exact match in the same window.
  for(const fault of ['missing','string','nonexistent','duplicate','window-id']){
   await reset();
   await evaluate(`globalThis.currentFault=${JSON.stringify(fault)}`);
   const expected=await worker.evaluate(()=>{
    const node=fixtureBg.tree.nodes[problemNodeId];
    const expected={tabId:node.tabId,windowId:node.windowId};
    if(currentFault==='missing')delete node.tabId;
    if(currentFault==='string')node.tabId=String(node.tabId);
    if(currentFault==='nonexistent')node.tabId=999999;
    if(currentFault==='duplicate')node.tabId=fixtureBg.tree.nodes[fixtureManifest[1].pairs[0][1]].tabId;
    if(currentFault==='window-id')delete node.windowId;
    globalThis.beforeFaultRepair=JSON.stringify(fixtureBg.tree.serializeNodes());
    return expected;
   });
   await install();
   assert.equal(await evaluate('tktstoRecovery.stats.repairedIdentities'),1);
   assert.equal(await evaluate('JSON.stringify(fixtureBg.tree.serializeNodes())===beforeFaultRepair'),true,'Preview must be read-only');
   const result=await evaluate('tktstoRecovery.apply()');
   assert.equal(result.reconnected,296);assert.equal(result.repairedIdentities,1);
   assert.equal(await evaluate('fixtureBg.tree.nodes[problemTargetId].tabId'),expected.tabId);
   const stored=await evaluate('fixtureBg.tree.db.loadAllNodes()');
   assert.equal(stored[targetId].tabId,expected.tabId);
   await evaluate('tktstoRecovery.undo()');
   assert.equal(await evaluate('fixtureBg.tree.nodes[problemNodeId].tabId'),expected.tabId);
   assert.equal(await evaluate('fixtureBg.tree.nodes[problemNodeId].windowId'),expected.windowId);
   console.log('PASS:',fault,'ID repaired from verified Chrome identity; preview unchanged; undo restores organization with valid IDs.');
  }
  // Ambiguous identities must not be assigned by tree order.
  for(const fault of ['shared-identity','two-candidates','no-match','cross-window']){
   await reset();
   await evaluate(`globalThis.currentFault=${JSON.stringify(fault)}`);
   await worker.evaluate(()=>{
    const node=fixtureBg.tree.nodes[problemNodeId];
    const tab=fixtureWindows.flatMap(w=>w.tabs).find(t=>t.id===node.tabId);
    if(currentFault==='shared-identity'){
     const other=fixtureBg.tree.nodes[fixtureManifest[1].pairs[0][1]];
     other.url=node.url;other.tabId=node.tabId;
    } else {
     delete node.tabId;
     if(currentFault==='two-candidates')fixtureWindows[1].tabs.push({...tab,id:7777});
     if(currentFault==='no-match')tab.url+='\x23different-fragment';
     if(currentFault==='cross-window'){
      fixtureWindows[1].tabs=fixtureWindows[1].tabs.filter(t=>t!==tab);
      fixtureWindows[0].tabs.push({...tab,windowId:fixtureWindows[0].id});
     }
    }
    globalThis.beforeBlockedRepair=JSON.stringify(fixtureBg.tree.serializeNodes());
   });
   await evaluate(source);
   for(let i=0;i<100&&!await evaluate('!!globalThis.tktstoRecovery?.version');i++)await new Promise(r=>setTimeout(r,20));
   await assert.rejects(()=>evaluate('tktstoRecovery.preview()'),/Live tab identity needs review/);
   await assert.rejects(()=>evaluate('tktstoRecovery.apply()'),/Live tab identity needs review/);
   assert.equal(await evaluate('JSON.stringify(fixtureBg.tree.serializeNodes())===beforeBlockedRepair'),true);
   assert.equal(await evaluate('tktstoRecovery.backupKey'),null);
   assert.equal(await evaluate('tktstoRecovery.busy'),false);
   console.log('PASS:',fault,'blocks both preview and apply without modifying the tree.');
  }
  // Export diagnostics with real IDs without writing to the user's Downloads.
  await evaluate('globalThis.capturedDownloads=[];chrome.downloads.download=async request=>{capturedDownloads.push(request);return capturedDownloads.length}');
  await evaluate('tktstoRecovery.downloadDiagnostics()');
  const report=await evaluate('JSON.parse(decodeURIComponent(capturedDownloads.at(-1).url.split(",").slice(1).join(",")))');
  assert.equal(Object.keys(report.nodes).length,1251);
  assert.equal(Object.keys(report.databaseNodes).length,1251);
  assert.ok(report.browserWindows[0].tabs[0].id);
  assert.ok(report.issues.length);
  const exporter=await fs.readFile(extension+'/recovery/export-live-diagnostic.js','utf8');
  await evaluate(exporter);
  for(let i=0;i<100&&await evaluate('capturedDownloads.length')<2;i++)await new Promise(r=>setTimeout(r,20));
  const exported=await evaluate('JSON.parse(decodeURIComponent(capturedDownloads.at(-1).url.split(",").slice(1).join(",")))');
  assert.equal(Object.keys(exported.nodes).length,1251);
  assert.equal(exported.runtimeDetails[nodeId].tabIdType,'undefined');
  assert.ok(exported.databaseNodes[nodeId].tabId);
  assert.equal(await evaluate('JSON.stringify(fixtureBg.tree.serializeNodes())===beforeBlockedRepair'),true);
  assert.deepEqual(await evaluate('browserMutationCalls'),[]);
  console.log('PASS: standalone exporter and diagnostic method retain live IDs, runtime types, stored records and Chrome tabs; no browser or tree mutations.');
 }finally{
  await cdp.send('Target.detachFromTarget',{sessionId});
  await context.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
