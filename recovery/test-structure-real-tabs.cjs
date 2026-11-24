const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const harness = require('./structure-test-harness.cjs');
(async()=>{
  const h = await harness(), { context, worker, ev, install }=h;
  try {
    const names=['pinned','c','b','a','later'];
    const pages=[context.pages()[0]];
    for(let i=1;i<names.length;i++) pages.push(await context.newPage());
    for(let i=0;i<names.length;i++) {
      await pages[i].goto('about:blank#structure-'+names[i]+'-history');
      await pages[i].goto('about:blank#structure-'+names[i]);
    }
    await worker.evaluate(async()=>{
      await realBg.treeLoaded;
      // Drain the real extension's startup/navigation reorder work before
      // taking over its graph with the explicit fixture.
      globalThis.waitFixtureIdle = async () => {
        let stable = 0;
        for (let i=0;i<150;i++) {
          await new Promise(resolve=>setTimeout(resolve,100));
          if (realBg.needsTabReorder || realBg.tabReorderInProgress || realBg.browserRestore?.activeEvents
            || realBg.browserRestore?.reconciling || realBg.nodesLoading.length || realBg.windowsLoading.length) stable=0;
          else if (++stable >= 5) return;
        }
        throw Error('Real extension startup did not settle');
      };
      await waitFixtureIdle();
      const tabs=await chrome.tabs.query({});
      await chrome.tabs.update(tabs.find(t=>t.url==='about:blank#structure-pinned').id,{pinned:true});
      await waitFixtureIdle();
    });
    await new Promise(resolve=>setTimeout(resolve,500));
    await worker.evaluate(async()=>{
      const bg=realBg, tree=bg.tree;
      if(bg.browserRestore){clearTimeout(bg.browserRestore.timer);bg.browserRestore.token=null;bg.browserRestore.state=null;}
      const tabs=await chrome.tabs.query({});
      const tab=name=>tabs.find(t=>t.url==='about:blank#structure-'+name);
      if (!tab('pinned').pinned) throw Error('Pinned fixture tab was changed by startup work');
      const win=tab('a').windowId;
      const live=(id,name,parent,nodes=[])=>({id,type:'',parent,nodes,url:tab(name).url,title:name,
        loaded:true,wasLoaded:false,tabId:tab(name).id,windowId:win,incognito:false,
        note:'Retain '+name,ctime:1234,tabHistory:[{url:'about:blank#past-'+name,kind:'url',changedAt:1}]});
      const raw={
        root:{id:'root',parent:'root',nodes:['window'],ctime:1782236513300},
        window:{id:'window',parent:'root',nodes:['pins','C','B','current-A'],type:'window',loaded:true,windowId:win},
        pins:{id:'pins',parent:'window',label:'Pinned',nodes:['P']},
        P:live('P','pinned','pins'),
        C:live('C','c','window'),
        B:live('B','b','window',['X']),
        'current-A':live('current-A','a','window',['saved']),
        X:live('X','later','B'),
        saved:{id:'saved',parent:'current-A',url:'about:blank#saved-structure',note:'saved child',nodes:[]}
      };
      tree.createRootNode();tree.rebuildNodeFromSerializedHash(tree.root,raw);tree.cfg.clientId='mac';
      tree.nodes['current-A'].oldTabId=999;tree.nodes['current-A'].naturalExternalRoot='runtime-only';
      const emit=async function emit(){};emit.bkgd=bg;globalThis.temp1=[emit];
      globalThis.originalBrowser=await chrome.windows.getAll({populate:true});
      globalThis.originalTree=JSON.parse(JSON.stringify(tree.serializeNodes()));
      globalThis.mutations=[];globalThis.observedMoves=[];globalThis.treeMoveCalls=0;
      const originalHandler=tree.onTabMoved;
      tree.onTabMoved=function(...args){treeMoveCalls++;return Reflect.apply(originalHandler,this,args)};
      chrome.tabs.onMoved.addListener((id,info)=>observedMoves.push({id,info,suppressed:bg.tabReorderInProgress&&!bg.tabReorderStalled}));
      for(const [obj,names] of [[chrome.tabs,['create','remove','update','reload']],[chrome.windows,['create','remove','update']]])
        for(const name of names) obj[name]=async()=>{mutations.push(name);throw Error('Forbidden mutation '+name)};
      const db=await tree.db.db;
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(['Nodes','Snapshots'],'readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
        tx.objectStore('Nodes').clear();tx.objectStore('Snapshots').clear();
        for(const node of Object.values(tree.serializeNodes()))tx.objectStore('Nodes').put({key:node.id,data:JSON.stringify(node)});
      });
    });
    const hash=url=>crypto.createHash('sha256').update(url).digest('hex');
    const m=[['root','root',null,'','root'],['window','root',null,'window','window'],['pins','window',null,'','pins'],
      ['P','pins',hash('about:blank#structure-pinned'),'','P'],
      ['historical-A','window',hash('about:blank#structure-a'),'','current-A'],
      ['B','historical-A',hash('about:blank#structure-b'),'','B'],
      ['C','window',hash('about:blank#structure-c'),'','C'],
      ['saved','C',hash('about:blank#saved-structure'),'','saved']];
    const source=(await fs.readFile(path.join(__dirname,'restore-order-and-structure.js'),'utf8'))
      .replace(/const BASELINE = \/\* STRUCTURE_MANIFEST \*\/ [\s\S]*?;\n  const assert/, 'const BASELINE = /* STRUCTURE_MANIFEST */ '+JSON.stringify(m)+';\n  const assert');
    const cds=await Promise.all(pages.map(p=>context.newCDPSession(p)));
    const histories=await Promise.all(cds.map(c=>c.send('Page.getNavigationHistory')));
    const browserSignature=()=>ev('chrome.tabs.query({}).then(tabs=>tabs.map(t=>[t.id,t.url,t.windowId,t.index,t.pinned,t.groupId]))');
    const originalBrowser=await browserSignature();
    const stats=await install(source,'tktstoStructure');
    assert.equal(stats.changedParents,2);assert.equal(stats.chromeWindowsToReorder,1);assert.equal(stats.preservedLaterEntries,1);
    // An unrelated reorder that starts while our locks are being acquired
    // must be left alone; our failed guard does not own its flag.
    await ev('globalThis.originalLock=realBg.tree.onTabCreatedMutex.lock;realBg.tree.onTabCreatedMutex.lock=async function(){const release=await Reflect.apply(originalLock,this,[]);realBg.tabReorderInProgress=true;return release}');
    await assert.rejects(()=>ev('tktstoStructure.apply()'),/restoring or moving tabs/);
    assert.equal(await ev('realBg.tabReorderInProgress'),true);
    await ev('realBg.tree.onTabCreatedMutex.lock=originalLock;realBg.tabReorderInProgress=false');
    assert.deepEqual(await browserSignature(),originalBrowser);
    await ev('tktstoStructure.apply()');
    await new Promise(resolve=>setTimeout(resolve,250));
    assert.deepEqual(await ev('chrome.tabs.query({}).then(t=>t.map(t=>t.url))'),
      ['pinned','a','b','later','c'].map(n=>'about:blank#structure-'+n));
    const afterTree=await ev('realBg.tree.serializeNodes()');
    assert.equal(afterTree.B.parent,'current-A');assert.equal(afterTree.saved.parent,'C');assert.equal(afterTree.X.parent,'B');
    assert.equal(await ev('realBg.tree.nodes["current-A"].oldTabId'),999);
    assert.equal(await ev('realBg.tree.nodes["current-A"].naturalExternalRoot'),'runtime-only');
    const afterBrowser=await browserSignature();
    assert.deepEqual(afterBrowser.map(t=>t.filter((_,i)=>i!==3)).sort(),originalBrowser.map(t=>t.filter((_,i)=>i!==3)).sort());
    assert.deepEqual(await Promise.all(cds.map(c=>c.send('Page.getNavigationHistory'))),histories);
    assert.equal(await ev('treeMoveCalls'),0);assert.equal(await ev('observedMoves.every(e=>e.suppressed)'),true);
    assert.deepEqual(await ev('mutations'),[]);
    const key=await ev('tktstoStructure.backupKey');
    await ev('delete globalThis.tktstoStructure');await install(source,'tktstoStructure');
    await ev(`tktstoStructure.resume(${JSON.stringify(key)})`);
    await ev('tktstoStructure.undo()');
    await new Promise(resolve=>setTimeout(resolve,250));
    assert.deepEqual(await browserSignature(),originalBrowser);
    assert.deepEqual(await ev('realBg.tree.serializeNodes()'),await ev('originalTree'));
    assert.deepEqual(await Promise.all(cds.map(c=>c.send('Page.getNavigationHistory'))),histories);
    assert.equal(await ev('treeMoveCalls'),0);
    console.log('PASS: real Chrome apply/resume/undo moves only existing tabs, preserves IDs/URLs/history/pin/groups/runtime metadata, and suppresses every move event without delayed tree damage.');
    await ev('tktstoStructure.preview()');await ev('tktstoStructure.apply()');
    await ev('realBg.tree.loadTreeFromDB()');
    assert.deepEqual(await ev('realBg.tree.serializeNodes()'),afterTree);
    assert.deepEqual(await browserSignature(),afterBrowser);
    console.log('PASS: real browser and persisted graph agree after DB reload.');
  }finally{await h.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
