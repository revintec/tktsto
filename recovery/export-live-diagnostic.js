// Read-only export. Paste in the same TKTSTO service-worker Console used for
// recovery. Uses the temp1/temp2 array from the earlier queryObjects setup.
// Includes live identities omitted from normal TKTSTO backups.
void (async () => {
  const backgrounds = new Set();
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(globalThis))) {
    if (!/^temp\d+$/.test(name) || !Array.isArray(descriptor.value)) continue;
    for (const fn of descriptor.value) {
      if (typeof fn !== 'function' || fn.name !== 'emit') continue;
      const bg = Object.getOwnPropertyDescriptor(fn, 'bkgd')?.value;
      if (bg?.tree?.db && bg.tree.bkgd === bg) backgrounds.add(bg);
    }
  }
  if (backgrounds.size !== 1) {
    throw new Error('Run queryObjects((async () => {}).constructor), right-click its array and choose Store as global variable, then run this again.');
  }
  const bg = [...backgrounds][0];
  await bg.treeLoaded;
  const nodes = JSON.parse(JSON.stringify(bg.tree.serializeNodes(false)));
  const runtimeDetails = Object.fromEntries(Object.entries(bg.tree.nodes).map(([id, node]) => [id, {
    tabIdType: typeof node.tabId,
    windowIdType: typeof node.windowId,
    oldTabId: node.oldTabId,
    tabClosedReason: node.tabClosedReason
  }]));
  const [browserWindows, databaseNodes] = await Promise.all([
    chrome.windows.getAll({ populate: true }),
    bg.tree.db.loadAllNodes()
  ]);
  const report = {
    kind: 'tktsto-live-diagnostic',
    exportedAt: new Date().toISOString(),
    extensionId: chrome.runtime.id,
    extensionVersion: chrome.runtime.getManifest().version,
    recoveryVersion: globalThis.tktstoRecovery?.version,
    nodes, runtimeDetails, databaseNodes, browserWindows
  };
  const filename = `tktsto-live-diagnostic-${Date.now()}.json`;
  await chrome.downloads.download({
    url: 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report)),
    filename, saveAs: false
  });
  console.log('Diagnostic download started:', filename);
})().catch(console.error);
