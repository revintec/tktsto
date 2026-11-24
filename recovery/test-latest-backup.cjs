const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const extension = path.resolve(__dirname, '..');
const backupPath = process.argv[2];
if (!backupPath) throw new Error('Usage: node recovery/test-latest-backup.cjs /path/to/05-57-backup.json');
(async () => {
 const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
 const initialCount = Object.keys(backup.nodes).length;
 const liveCount = Object.values(backup.nodes).filter(n => n.loaded && n.url && n.type !== 'window').length;
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
  const preview = await evaluate('({matches:tktstoRecovery.matches.length,skipped:tktstoRecovery.skipped.length,summary:tktstoRecovery.summary})');
  assert.equal(preview.matches,264);assert.equal(preview.skipped,32);
  console.log('PREVIEW',JSON.stringify(preview));
  const eligible = await evaluate('tktstoRecovery.matches.map(m=>[m.original,m.restored])');
  const skipped = await evaluate('tktstoRecovery.skipped.map(m=>m.restored)');
  const applied=await evaluate('tktstoRecovery.apply()');
  assert.equal(applied.reconnected,264);assert.equal(applied.removedTreeEntries,268);assert.equal(applied.remainingPink,117);
  const result=await worker.evaluate(async ({eligible,skipped})=>{
   const tree=fixtureBg.tree,after=tree.serializeNodes();
   const removed=new Set([...fixtureManifest.map(g=>g.restoredWindow),...eligible.map(m=>m[1])]);
   for(const id of Object.keys(originalFixture))if(!removed.has(id)&&!after[id])throw Error('Lost preserved node '+id);
   for(const [original,donor]of eligible){
    if(after[original].tabId!==originalFixture[donor].tabId||!after[original].loaded)throw Error('Attachment mismatch');
    for(const key of ['parent','label','note','checkbox','bookmark','expanded','ctime'])
     if(JSON.stringify(after[original][key])!==JSON.stringify(originalFixture[original][key]))throw Error('Metadata changed '+key);
   }
   for(const id of skipped)if(!after[id]?.loaded||after[id].tabId!==originalFixture[id].tabId)throw Error('Skipped tab lost');
   const stored=await tree.db.loadAllNodes();
   const snapshot=await tree.db.loadObj('Snapshots',tktstoRecovery.backupKey);
   return {nodes:Object.keys(after).length,stored:Object.keys(stored).length,backupNodes:Object.keys(snapshot.nodes).length,
    loadedTabs:Object.values(after).filter(n=>n.url&&n.type!=='window'&&n.loaded).length,
    preservedSkipped:skipped.length,mutations:browserMutationCalls};
  },{eligible,skipped});
  assert.deepEqual(result,{nodes:initialCount-268,stored:initialCount-268,backupNodes:initialCount,loadedTabs:liveCount,preservedSkipped:32,mutations:[]});
  console.log('PASS: latest script on supplied newer backup:',JSON.stringify(result));
  assert.equal((await evaluate('tktstoRecovery.undo()')).undone,true);
  assert.equal(await evaluate('Object.keys(fixtureBg.tree.nodes).length'),initialCount);
  console.log(`PASS: immediate undo restores all ${initialCount} entries.`);
 } finally {
  await cdp.send('Target.detachFromTarget',{sessionId});
  await context.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
