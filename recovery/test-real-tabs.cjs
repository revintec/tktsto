const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const vm=require('node:vm');
(async()=>{
 const extension=path.resolve(__dirname,'..');
 const source=await fs.readFile(extension+'/recovery/reconnect-restored-tabs-latest.js','utf8');
 const group=vm.runInNewContext(source.match(/const GROUPS = \/\* RECOVERY_MANIFEST \*\/ ([\s\S]*?);\n  const assert/)[1])[0];
 const context=await chromium.launchPersistentContext(await fs.mkdtemp(path.join(os.tmpdir(),'tktsto-recovery-real-')),{executablePath:process.env.CHROME_PATH||chromium.executablePath(),headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 await worker.evaluate(()=>typeof chrome);
 const first=context.pages()[0];await first.goto('about:blank#recovery-first-history');await first.goto('about:blank#recovery-first');
 const second=await context.newPage();await second.goto('about:blank#recovery-second-history');await second.goto('about:blank#recovery-second');
 const extra=await context.newPage();await extra.goto('about:blank#new-unmatched-tab');
 const cdp=await context.newCDPSession(first);
 const target=(await cdp.send('Target.getTargets')).targetInfos.find(x=>x.type==='service_worker'&&x.url===worker.url());
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
 let seq=0;const pending=new Map();
 cdp.on('Target.receivedMessageFromTarget',event=>{const m=JSON.parse(event.message);if(m.id)pending.get(m.id)?.(m);});
 const send=async(method,params)=>new Promise(async resolve=>{const id=++seq;pending.set(id,resolve);await cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})});});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,includeCommandLineAPI:true});if(r.result.exceptionDetails)throw new Error(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text);return r.result.result.value;};
 try {
  await new Promise(r=>setTimeout(r,1000));
  const p=await send('Runtime.evaluate',{expression:'Object.getPrototypeOf(async function(){})'});
  const objects=await send('Runtime.queryObjects',{prototypeObjectId:p.result.result.objectId});
  await send('Runtime.callFunctionOn',{objectId:objects.result.objects.objectId,functionDeclaration:'function(){globalThis.temp1=this;globalThis.testBg=this.find(f=>f.name==="emit"&&f.bkgd?.tree).bkgd}'});
  await worker.evaluate(async group=>{
   await testBg.treeLoaded;const tree=testBg.tree;
   if(testBg.browserRestore){clearTimeout(testBg.browserRestore.timer);testBg.browserRestore.state=null;}
   const tabs=await chrome.tabs.query({});
   const tab1=tabs.find(t=>t.url==='about:blank#recovery-first');const tab2=tabs.find(t=>t.url==='about:blank#recovery-second');const extra=tabs.find(t=>t.url==='about:blank#new-unmatched-tab');
   if(!tab1||!tab2||!extra||tabs.length!==3)throw Error('Unexpected test browser tabs');
   const [a,b]=group.pairs;
   const dicts={root:{id:'root',parent:'root',ctime:1782236513300,nodes:[group.savedWindow,group.restoredWindow]},
    [group.savedWindow]:{id:group.savedWindow,parent:'root',type:'window',label:'Original named window',nodes:[a[0],b[0]],incognito:false},
    [group.restoredWindow]:{id:group.restoredWindow,parent:'root',type:'window',loaded:true,windowId:tab1.windowId,nodes:[a[1],b[1],'unmatched-new-tab'],incognito:false},
    [a[0]]:{id:a[0],parent:group.savedWindow,url:tab1.url,title:'Saved first',wasLoaded:true,note:'Original note',nodes:['saved-child']},
    [b[0]]:{id:b[0],parent:group.savedWindow,url:tab2.url,title:'Saved second'},
    [a[1]]:{id:a[1],parent:group.restoredWindow,url:tab1.url,title:tab1.title,loaded:true,windowId:tab1.windowId,tabId:tab1.id},
    [b[1]]:{id:b[1],parent:group.restoredWindow,url:tab2.url,title:tab2.title,loaded:true,windowId:tab2.windowId,tabId:tab2.id},
    'saved-child':{id:'saved-child',parent:a[0],label:'Original child',note:'Keep original descendant'},
    'unmatched-new-tab':{id:'unmatched-new-tab',parent:group.restoredWindow,url:extra.url,title:extra.title,loaded:true,windowId:extra.windowId,tabId:extra.id}
   };
   tree.createRootNode();tree.rebuildNodeFromSerializedHash(tree.root,dicts);tree.cfg.clientId='mac';
   const db=await tree.db.db;
   await new Promise((resolve,reject)=>{const tx=db.transaction('Nodes','readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);const store=tx.objectStore('Nodes');store.clear();for(const node of Object.values(tree.nodes))store.put({key:node.id,data:JSON.stringify(node.toDict())});});
   globalThis.testGroup=group;globalThis.beforeBrowserTabs=tabs.map(t=>[t.id,t.url,t.windowId,t.index]);
  },group);
  const history=await cdp.send('Page.getNavigationHistory');
  // Emulate a live tab whose tree entry has lost its tab ID.
  await ev('delete testBg.tree.nodes[testGroup.pairs[0][1]].tabId');
  await ev(source);
  for(let i=0;i<100&&!await ev('!!tktstoRecovery?.summary');i++)await new Promise(r=>setTimeout(r,20));
  assert.equal(await ev('tktstoRecovery.matches.length'),2);
  assert.equal(await ev('tktstoRecovery.stats.repairedIdentities'),1);
  assert.equal((await ev('tktstoRecovery.apply()')).reconnected,2);
  const after=await worker.evaluate(async()=>({tabs:(await chrome.tabs.query({})).map(t=>[t.id,t.url,t.windowId,t.index]),before:beforeBrowserTabs,note:testBg.tree.nodes[testGroup.pairs[0][0]].note,child:testBg.tree.nodes['saved-child'].parent.id,extra:testBg.tree.nodes['unmatched-new-tab'].getWindowNode().id}));
  assert.deepEqual(after.tabs,after.before);assert.equal(after.note,'Original note');assert.equal(after.child,group.pairs[0][0]);assert.equal(after.extra,group.savedWindow);
  assert.deepEqual(await cdp.send('Page.getNavigationHistory'),history);
  await ev('tktstoRecovery.undo()');
  assert.deepEqual(await worker.evaluate(async()=>(await chrome.tabs.query({})).map(t=>[t.id,t.url,t.windowId,t.index])),after.before);
  assert.deepEqual(await cdp.send('Page.getNavigationHistory'),history);
  console.log('PASS: missing ID recovered from real Chrome; tabs keep their IDs, URLs, windows, order, and navigation history through apply and undo; original notes/children and a new unmatched live tab survive.');
  await ev('tktstoRecovery.apply()');
  await ev('(async()=>{await testBg.tree.loadTreeFromDB();await testBg.mergeOpenWindowsIntoTree();return true})()');
  assert.equal(await ev('Object.keys(testBg.tree.nodes).length'),6);
  assert.equal(await ev('testBg.tree.nodes[testGroup.savedWindow].loaded'),true);
  assert.equal(await ev('!!testBg.tree.nodes[testGroup.restoredWindow]'),false);
  assert.deepEqual(await worker.evaluate(async()=>(await chrome.tabs.query({})).map(t=>[t.id,t.url,t.windowId,t.index])),after.before);
  console.log('PASS: database reload and normal session reconciliation preserve the repaired tree without recreating duplicates.');
 } finally {await cdp.send('Target.detachFromTarget',{sessionId});await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
