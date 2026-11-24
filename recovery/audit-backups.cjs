// Read-only chronological audit. Executes only script previews in a Node VM;
// provides no browser connection, IndexedDB implementation or write APIs.
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const clone = value => JSON.parse(JSON.stringify(value));
const children = node => node.nodes || [];
const isTab = node => !!node.url && node.type !== 'window';
const urls = nodes => new Set(Object.values(nodes).filter(isTab).map(n => n.url));
const difference = (a, b) => [...a].filter(value => !b.has(value));
const localTime = ms => new Date(ms + 8 * 3600 * 1000).toISOString().replace('T', ' ').replace('Z', ' +08:00');
const cleanTitle = text => (text || '').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '').trim();
const brief = node => node && ({ id: node.id, title: cleanTitle(node.label || node.title), url: node.url,
  parent: node.parent, children: children(node), loaded: !!node.loaded, pink: !node.loaded && !!node.wasLoaded });

function validate(nodes) {
  const seen = new Set();
  const visit = id => {
    assert(nodes[id] && nodes[id].id === id && !seen.has(id), 'Invalid/cyclic node ' + id);
    seen.add(id);
    for (const child of children(nodes[id])) {
      assert.equal(nodes[child]?.parent, id, 'Broken parent link ' + child);
      visit(child);
    }
  };
  assert.equal(nodes.root.parent, 'root');
  visit('root');
  assert.equal(seen.size, Object.keys(nodes).length, 'Unreachable nodes');
}

function transition(a, b) {
  const an = a.nodes, bn = b.nodes, au = urls(an), bu = urls(bn);
  const removed = Object.keys(an).filter(id => !bn[id]), added = Object.keys(bn).filter(id => !an[id]);
  const common = Object.keys(an).filter(id => bn[id]);
  const fieldChanges = {};
  for (const id of common) for (const key of new Set([...Object.keys(an[id]), ...Object.keys(bn[id])])) {
    if (JSON.stringify(an[id][key]) !== JSON.stringify(bn[id][key])) fieldChanges[key] = (fieldChanges[key] || 0) + 1;
  }
  return { from: a.name, to: b.name, removedIds: removed, addedIds: added, fieldChanges,
    missingUrls: difference(au, bu).map(url => ({ url, entries: Object.values(an).filter(n => n.url === url)
      .map(n => ({ before: brief(n), sameIdAfter: brief(bn[n.id]) || null })) })),
    addedUrls: difference(bu, au),
    changedUrls: common.filter(id => an[id].url !== bn[id].url)
      .map(id => ({ id, before: brief(an[id]), after: brief(bn[id]), modifiedAt: localTime(bn[id].mtime) })),
    annotationChanges: common.flatMap(id => ['label', 'note', 'checkbox', 'bookmark'].flatMap(key =>
      JSON.stringify(an[id][key]) === JSON.stringify(bn[id][key]) ? [] : [{ id, field: key, before: an[id][key], after: bn[id][key] }])),
    removedAnnotated: removed.filter(id => ['label', 'note', 'checkbox', 'bookmark'].some(key => !!an[id][key])) };
}

async function scriptPlan(source, raw, diagnostic, helper) {
  const bg = { treeLoaded: Promise.resolve() };
  const pinned = id => {
    const node = raw[id]; let current = node;
    while (current && current.type !== 'window' && current.id !== 'root') current = raw[current.parent];
    if (current?.type !== 'window') return false;
    const first = raw[children(current)[0]];
    if (!first || first.label !== 'Pinned' || first.url || first.type === 'window') return false;
    current = node;
    while (current && current.id !== 'root') {
      if (current.id === first.id) return true;
      current = raw[current.parent];
    }
    return false;
  };
  const tree = { bkgd: bg, root: raw.root, cfg: { clientId: 'mac' },
    db: { saveNodes() { throw new Error('Audit forbids writes'); } },
    serializeNodes: () => clone(raw),
    nodes: Object.fromEntries(Object.entries(raw).map(([id, node]) => [id, { ...node, isPinned: () => pinned(id) }])) };
  bg.tree = tree;
  const emit = async function emit() {}; emit.bkgd = bg;
  const errors = [];
  const context = vm.createContext({ temp1: [emit], TextEncoder, URLSearchParams, crypto: crypto.webcrypto,
    console: { log() {}, table() {}, error: (...args) => errors.push(args.map(String).join(' ')) },
    chrome: { runtime: { id: diagnostic.extensionId }, windows: { getAll: async () => clone(diagnostic.browserWindows) } } });
  const instrumented = source.replace('void (async () => {', '(async () => {')
    .replace(`  globalThis.${helper} = api;`, `  globalThis.auditPlan = plan; globalThis.auditBrowser = browserState;\n  globalThis.${helper} = api;`);
  await vm.runInContext(instrumented, context);
  assert.deepEqual(errors, [], 'Read-only script preview failed');
  return clone(await context.auditPlan(clone(raw), await context.auditBrowser()));
}

(async () => {
  const [diagnosticPath, ...backupPaths] = process.argv.slice(2);
  assert.equal(backupPaths.length, 5, 'Usage: node recovery/audit-backups.cjs diagnostic.json five-backups-in-time-order.json');
  const docs = [];
  for (const file of backupPaths) {
    const bytes = await fs.readFile(file), data = JSON.parse(bytes);
    validate(data.nodes);
    docs.push({ ...data, name: path.basename(file), path: file, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  for (let i = 1; i < docs.length; i++) assert(docs[i].metadata.exportDate > docs[i - 1].metadata.exportDate);
  const diagnostic = JSON.parse(await fs.readFile(diagnosticPath, 'utf8'));
  const firstSource = await fs.readFile(path.join(__dirname, 'reconnect-restored-tabs-latest.js'), 'utf8');
  const secondSource = await fs.readFile(path.join(__dirname, 'deduplicate-after-recovery.js'), 'utf8');
  const first = await scriptPlan(firstSource, diagnostic.nodes, diagnostic, 'tktstoRecovery');
  const second = await scriptPlan(secondSource, first.after, diagnostic, 'tktstoDedup');
  validate(second.after);
  const final = docs[4].nodes;
  const semanticFields = ['type', 'url', 'parent', 'nodes', 'label', 'note', 'checkbox', 'bookmark', 'ctime', 'loaded', 'wasLoaded'];
  const normalized = (n, key) => key === 'nodes' ? children(n) : key === 'type' ? n.type || ''
    : ['loaded', 'wasLoaded', 'bookmark'].includes(key) ? !!n[key] : n[key] ?? null;
  const planDifferences = [];
  for (const id of new Set([...Object.keys(final), ...Object.keys(second.after)])) {
    if (!final[id] || !second.after[id]) { planDifferences.push({ id, missingFrom: final[id] ? 'plan' : 'latest' }); continue; }
    for (const key of semanticFields) if (JSON.stringify(normalized(final[id], key)) !== JSON.stringify(normalized(second.after[id], key)))
      planDifferences.push({ id, field: key, expected: normalized(second.after[id], key), actual: normalized(final[id], key) });
  }
  const transitions = docs.slice(1).map((doc, i) => transition(docs[i], doc));
  const summary = docs.map(doc => {
    const tabs = Object.values(doc.nodes).filter(isTab), unique = urls(doc.nodes);
    return { name: doc.name, exportedAt: localTime(doc.metadata.exportDate), nodes: Object.keys(doc.nodes).length,
      tabRecords: tabs.length, uniqueUrls: unique.size, extraExactUrlCopies: tabs.length - unique.size,
      loadedTabs: tabs.filter(n => n.loaded).length, pinkEntries: tabs.filter(n => !n.loaded && n.wasLoaded).length,
      windows: Object.values(doc.nodes).filter(n => n.type === 'window').length, graphValid: true };
  });
  // The 05:30 original tree is obtained by omitting only the four known
  // temporary restored windows and their descendants, not by guessing URLs.
  const baseline = clone(docs[1].nodes), excluded = new Set();
  const exclude = id => { excluded.add(id); for (const child of children(baseline[id])) exclude(child); };
  for (const id of ['1m854z49m--mac', '1m854z49a--mac', '1m854z27q--mac', '1m854z49p--mac']) exclude(id);
  for (const id of excluded) delete baseline[id];
  baseline.root.nodes = children(baseline.root).filter(id => !excluded.has(id));
  validate(baseline);
  assert.equal(urls(baseline).size, Object.values(baseline).filter(isTab).length);
  const finalByUrl = new Map(Object.values(final).filter(isTab).map(n => [n.url, n]));
  const identity = node => node.url ? 'url:' + node.url : 'id:' + node.id;
  const changedIds = new Set(transitions[1].changedUrls.map(n => n.id));
  const goneBeforeFirstRepair = new Set(transitions[1].removedIds);
  const parentDifferences = [];
  for (const old of Object.values(baseline).filter(isTab)) {
    const latest = finalByUrl.get(old.url); if (!latest) continue;
    const op = baseline[old.parent], np = final[latest.parent];
    if (identity(op) === identity(np)) continue;
    const category = changedIds.has(op.id) ? 'Children beneath a parent whose URL was overwritten'
      : goneBeforeFirstRepair.has(op.id) ? 'Children promoted after original parent deletion'
      : np.id === '1m79amsqw--mac' ? 'Saved reconstruction placed under a YouTube page'
      : np.id === '1m856bqzh--mac' ? 'Research link left in the separate saved window'
      : np.id === '1m0f0a1e9--mac' ? 'Work page placed in the research branch' : 'Other';
    parentDifferences.push({ category, before: brief(old), after: brief(latest), oldParent: brief(op), newParent: brief(np) });
  }
  const mergesWithDifferentHistoricalUrls = second.rows.filter(row => {
    const a = docs[1].nodes[row.retained], b = docs[1].nodes[row.removed];
    return a && b && a.url !== b.url;
  }).map(row => ({ retained: row.retained, removed: row.removed, matchedCurrentUrl: row.url,
    retainedAt0530: brief(docs[1].nodes[row.retained]), removedAt0530: brief(docs[1].nodes[row.removed]),
    latest: brief(final[row.retained]) }));
  const annotationCoverage = docs.map(doc => ({ name: doc.name,
    missing: Object.values(doc.nodes).flatMap(node => ['label', 'note', 'checkbox', 'bookmark'].flatMap(field => {
      if (!node[field]) return [];
      return Object.values(final).some(n => n[field] === node[field]) ? [] : [{ id: node.id, field, value: node[field] }];
    })) }));
  const report = { kind: 'tktsto-chronological-audit', readOnly: true,
    inputs: docs.map(d => ({ path: d.path, sha256: d.sha256 })), summary, transitions,
    finalUrlCoverage: docs.map(d => ({ name: d.name, missingUrls: difference(urls(d.nodes), urls(final)) })),
    auxiliaryLiveDiagnostic: { path: diagnosticPath, time: diagnostic.exportedAt,
      changesFrom0624: transition(docs[3], { name: '06:34 live diagnostic', nodes: diagnostic.nodes }) },
    scriptReplay: { firstPassMatches: first.matches.length, firstPassRemoved: first.removed.length,
      secondPassStats: second.stats, latestSemanticDifferences: planDifferences },
    overwrittenEntries: transitions[1].changedUrls,
    mergesWithDifferentHistoricalUrls, parentDifferences, annotationCoverage,
    remainingDuplicateGroups: second.remaining };
  const out = path.join(__dirname, 'audit-2026-11-24');
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'audit-details.json'), JSON.stringify(report, null, 2) + '\n');
  const categories = {};
  for (const item of parentDifferences) categories[item.category] = (categories[item.category] || 0) + 1;
  console.log(JSON.stringify({ summary, transitions: transitions.map(t => ({ from: t.from, to: t.to,
    removedIds: t.removedIds.length, addedIds: t.addedIds.length, missingUrls: t.missingUrls.length,
    newUrls: t.addedUrls.length, changedUrls: t.changedUrls.length, annotationChanges: t.annotationChanges.length,
    removedAnnotated: t.removedAnnotated.length })), replayDifferenceCount: planDifferences.length,
    historicalMergeMismatchCount: mergesWithDifferentHistoricalUrls.length,
    parentDifferenceCount: parentDifferences.length, parentDifferenceCategories: categories,
    missingAnnotations: annotationCoverage.map(x => ({ name: x.name, count: x.missing.length })), report: out }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
