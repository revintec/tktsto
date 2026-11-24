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
  await install();
  assert.equal(await evaluate('tktstoRecovery.matches.length'),296);
  const applied=await evaluate('tktstoRecovery.apply()');
  assert.equal(applied.reconnected,296);assert.equal(applied.removedTreeEntries,300);assert.equal(applied.remainingPink,35);
  const result=await worker.evaluate(async()=>{
   const tree=fixtureBg.tree;const after=tree.serializeNodes();let originalsPreserved=true;
   for(const group of fixtureManifest){
    for(const [oldId,donorId]of group.pairs){
     const old=originalFixture[oldId],now=after[oldId],donor=originalFixture[donorId];
     for(const key of ['parent','nodes','label','note','checkbox','bookmark','expanded','ctime'])if(JSON.stringify(old[key])!==JSON.stringify(now[key]))originalsPreserved=false;
     if(now.tabId!==donor.tabId||!now.loaded||after[donorId])originalsPreserved=false;
    }
   }
   const stored=await tree.db.loadAllNodes();
   const snapshot=await tree.db.loadObj('Snapshots',tktstoRecovery.backupKey);
   return {count:Object.keys(after).length,stored:Object.keys(stored).length,originalsPreserved,snapshotCount:Object.keys(snapshot.nodes).length,mutations:browserMutationCalls};
  });
  assert.deepEqual(result,{count:951,stored:951,originalsPreserved:true,snapshotCount:1251,mutations:[]});
  console.log('PASS: all 296 tabs reattached; 300 redundant entries removed; 35 pink entries preserved; original hierarchy/metadata and browser tab IDs retained; snapshot and database verified.');
  await assert.rejects(()=>evaluate('tktstoRecovery.apply()'),/Already applied/);
  assert.equal((await evaluate('tktstoRecovery.undo()')).undone,true);
  assert.equal(await evaluate('Object.keys(fixtureBg.tree.nodes).length'),1251);
  console.log('PASS: immediate undo restores original graph; repeated apply is refused.');
  // New content attached below a redundant donor must survive.
  await reset();
  await worker.evaluate(async()=>{
   const tree=fixtureBg.tree;const donor=tree.nodes[fixtureManifest[0].pairs[0][1]];
   const child=new tree.NodeClass(tree,donor);child.id='new-note-after-backup';child.label='Keep this';child.note='Unique new note';child.ctime=Date.now();child.mtime=Date.now();child.atime=Date.now();donor.nodes.push(child);tree.nodes[child.id]=child;
   await tree.db.saveNodes([donor,child]);
  });
  await install();await evaluate('tktstoRecovery.apply()');
  assert.deepEqual(await evaluate('({note:fixtureBg.tree.nodes["new-note-after-backup"].note,parent:fixtureBg.tree.nodes["new-note-after-backup"].parent.id})'),{note:'Unique new note',parent:manifest[0].pairs[0][0]});
  console.log('PASS: unique descendants added since backup survive under the original matching parent.');
  // Conflicting annotations must keep the donor itself.
  await reset();
  await evaluate('fixtureBg.tree.nodes[fixtureManifest[0].pairs[0][1]].note="New donor note"');
  await install();assert.equal(await evaluate('tktstoRecovery.matches.length'),295);
  await evaluate('tktstoRecovery.apply()');
  assert.equal(await evaluate('fixtureBg.tree.nodes[fixtureManifest[0].pairs[0][1]].note'),'New donor note');
  console.log('PASS: a donor with new annotations is preserved for review.');
  // Exact URL comparison preserves query and fragment semantics.
  await reset();await evaluate('fixtureBg.tree.nodes[fixtureManifest[0].pairs[0][0]].url += "#different"');
  await install();assert.equal(await evaluate('tktstoRecovery.matches.length'),295);
  await evaluate('tktstoRecovery.apply()');
  assert.equal(await evaluate('!!fixtureBg.tree.nodes[fixtureManifest[0].pairs[0][1]]'),true);
  console.log('PASS: differing URL fragments are not merged.');
  // Abort an actual IndexedDB transaction before completion.
  await reset();await install();
  await evaluate('globalThis.beforeFailure=JSON.stringify(fixtureBg.tree.serializeNodes());globalThis.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==="Nodes")throw new Error("injected write failure");return Reflect.apply(originalPut,this,args)}');
  await assert.rejects(()=>evaluate('tktstoRecovery.apply()'),/injected write failure/);
  await evaluate('IDBObjectStore.prototype.put=originalPut');
  assert.equal(await evaluate('JSON.stringify(fixtureBg.tree.serializeNodes())===beforeFailure'),true);
  assert.equal(await evaluate('fixtureBg.tree.db.loadAllNodes().then(nodes => Object.keys(nodes).length)'),1251);
  assert.equal(await evaluate('tktstoRecovery.busy'),false);
  await evaluate('tktstoRecovery.apply()');
  console.log('PASS: transaction failure leaves memory and database unchanged and releases locks; retry succeeds.');
  // Stale live state blocks undo rather than discarding subsequent work.
  await evaluate('fixtureWindows[0].tabs[0].url += "#navigated"');
  await assert.rejects(()=>evaluate('tktstoRecovery.undo()'),/navigated/);
  console.log('PASS: undo refuses to overwrite a changed browser session.');
  // Changes between preview and apply must be checked again.
  await reset();await install();
  await evaluate('fixtureWindows[0].tabs[0].url += "#navigated"');
  await assert.rejects(()=>evaluate('tktstoRecovery.apply()'),/Chrome and TKTSTO disagree/);
  assert.equal(await evaluate('Object.keys(fixtureBg.tree.nodes).length'),1251);
  console.log('PASS: apply revalidates Chrome state after preview and stops on a stale match.');
  // New duplicate URLs still have new entry IDs and must remain separate.
  // Close one mapped tab, preserve another as an annotated saved entry,
  // and add two new live tabs (one sharing a mapped URL).
  await reset();
  await worker.evaluate(async()=>{
   const tree=fixtureBg.tree,group=fixtureManifest[0],window=fixtureWindows[0];
   const removed=tree.nodes[group.pairs[0][1]];
   const closed=tree.nodes[group.pairs[1][1]];
   if(removed.nodes.length||closed.nodes.length)throw Error('Expected leaf fixture');
   const closedTabIds=new Set([removed.tabId,closed.tabId]);
   window.tabs=window.tabs.filter(t=>!closedTabIds.has(t.id));
   removed.parent.nodes=removed.parent.nodes.filter(n=>n!==removed);
   delete tree.nodes[removed.id];
   closed.loaded=false;closed.wasLoaded=false;closed.tabId=undefined;closed.windowId=undefined;closed.note='Keep closed tab note';
   const parent=tree.nodes[group.pairs[2][1]];
   const newTabs=[['new-matching-url',parent.url],['new-unrelated-url','https://recovery-test.invalid/new-page']];
   for(const [index,[id,url]]of newTabs.entries()){
    const node=new tree.NodeClass(tree,parent);
    Object.assign(node,{id,url,title:'New tab',loaded:true,windowId:window.id,tabId:5000+index,incognito:false});
    parent.nodes.push(node);tree.nodes[id]=node;
    window.tabs.push({id:node.tabId,windowId:window.id,url,title:node.title,index:window.tabs.length,pinned:false,incognito:false});
   }
   await tree.db.saveNodes([tree.nodes[group.restoredWindow],closed,parent,...newTabs.map(([id])=>tree.nodes[id])],[removed.id]);
  });
  await install();
  assert.equal(await evaluate('tktstoRecovery.matches.length'),294);
  assert.equal(await evaluate('tktstoRecovery.skipped.length'),2);
  const recentEdits=await evaluate('tktstoRecovery.apply()');
  assert.equal(recentEdits.liveTabs,296);
  assert.equal(await evaluate('fixtureBg.tree.nodes["new-matching-url"].tabId'),5000);
  assert.equal(await evaluate('fixtureBg.tree.nodes["new-unrelated-url"].tabId'),5001);
  assert.equal(await evaluate('fixtureBg.tree.nodes[fixtureManifest[0].pairs[1][1]].note'),'Keep closed tab note');
  assert.equal(await evaluate('!!fixtureBg.tree.nodes[fixtureManifest[0].pairs[0][1]]'),false);
  assert.equal(await evaluate('!!fixtureBg.tree.nodes[fixtureManifest[0].pairs[0][0]].loaded'),false);
  console.log('PASS: new tabs with matching and unrelated URLs remain open; closed tabs are skipped and stay closed; closed-tab annotations survive.');
  // A whole restored window closing must stop before any write.
  await reset();await install();
  await worker.evaluate(()=>{
   const win=fixtureBg.tree.nodes[fixtureManifest[0].restoredWindow];
   fixtureWindows=fixtureWindows.filter(w=>w.id!==win.windowId);
   for(const n of [win,...win.findNodes()]){n.loaded=false;n.wasLoaded=true;n.tabId=undefined;n.windowId=undefined;}
  });
  const beforeWindowAbort=await evaluate('JSON.stringify(fixtureBg.tree.serializeNodes())');
  await assert.rejects(()=>evaluate('tktstoRecovery.apply()'),/Restored window is no longer open/);
  assert.equal(await evaluate('JSON.stringify(fixtureBg.tree.serializeNodes())'),beforeWindowAbort);
  assert.equal(await evaluate('tktstoRecovery.backupKey'),null);
  console.log('PASS: closing an entire restored window stops repair before changing the tree.');
  assert.deepEqual(await evaluate('browserMutationCalls'),[]);
 }finally{
  await cdp.send('Target.detachFromTarget',{sessionId});
  await context.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
