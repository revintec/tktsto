#!/usr/bin/env python3
"""Compare the eight supplied snapshots without modifying source files."""
from collections import Counter, defaultdict
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
import json
import re
import unicodedata

UPLOADS = Path('/Users/revin/code/chatGPT-dom-html-viewer/.runtime/uploads')
INPUT_DIRS = [
    UPLOADS / 'attached-db43e209-5404-44c7-9d6a-533ede33365f',
    UPLOADS / 'attached-6fe5a999-981b-4755-80a3-e02c8cf6c6d3',
]
OUT = Path(__file__).resolve().parent
TZ = ZoneInfo('Asia/Shanghai')


def local_time(seconds):
    return datetime.fromtimestamp(seconds, TZ).isoformat(timespec='milliseconds')


def tabs(nodes):
    return {key: node for key, node in nodes.items()
            if node.get('url') and node.get('type') != 'window'}


def clean(value):
    return ''.join(c for c in str(value) if unicodedata.category(c) != 'Cf')


def cell(value):
    return clean(value).replace('|', '\\|').replace('\n', ' ').replace('\r', ' ')


def link(label, url):
    label = cell(label).replace('[', '\\[').replace(']', '\\]')
    return f'[{label}](<{url}>)'


def display_title(node):
    title = clean(node.get('title') or node.get('url') or node.get('id'))
    title = re.sub(r'^\(\d+\)\s*', '', title)
    if title.startswith('jav.guru/990077/'):
        return 'SDDE-766 page — jav.guru'
    return title


def parent_path(node_id, nodes):
    result, seen = [], {node_id}
    parent = nodes[node_id].get('parent')
    while parent and parent != 'root' and parent not in seen:
        seen.add(parent)
        node = nodes.get(parent)
        if node is None:
            result.append(f'[missing parent: {parent}]')
            break
        result.append(node.get('label') or node.get('title') or parent)
        parent = node.get('parent')
    return list(reversed(result))


sources = []
for folder in INPUT_DIRS:
    for path in folder.glob('*/*.json'):
        raw = path.read_bytes()
        data = json.loads(raw)
        if 'metadata' in data:
            timestamp = data['metadata']['exportDate'] / 1000
            timestamp_field = 'metadata.exportDate'
        else:
            timestamp = datetime.fromisoformat(data['exportedAt'].replace('Z', '+00:00')).timestamp()
            timestamp_field = 'exportedAt'
        sources.append(dict(path=str(path), name=path.name, timestamp=timestamp,
                            timestamp_field=timestamp_field, local_time=local_time(timestamp),
                            sha256=sha256(raw).hexdigest(), data=data))
sources.sort(key=lambda source: source['timestamp'])
assert len(sources) == 8
latest = sources[-1]
latest_nodes = latest['data']['nodes']
latest_tabs = tabs(latest_nodes)
latest_by_url = defaultdict(list)
for node_id, node in latest_tabs.items():
    latest_by_url[node['url']].append(node_id)

by_id, by_url = defaultdict(list), defaultdict(list)
summary = []
for source in sources:
    source_tabs = tabs(source['data']['nodes'])
    absent_ids = set(source_tabs) - set(latest_nodes)
    absent_urls = {node['url'] for node in source_tabs.values()} - set(latest_by_url)
    summary.append({key: source[key] for key in
                    ('name', 'path', 'local_time', 'timestamp_field', 'sha256')} | {
        'node_count': len(source['data']['nodes']), 'tab_count': len(source_tabs),
        'unique_url_count': len({n['url'] for n in source_tabs.values()}),
        'tab_ids_absent_from_latest': len(absent_ids),
        'exact_urls_absent_from_latest': len(absent_urls),
    })
    if source is latest:
        continue
    for node_id, node in source_tabs.items():
        observation = dict(file=source['name'], source_path=source['path'],
                           exported_at=source['local_time'], node=node,
                           parent_path=parent_path(node_id, source['data']['nodes']))
        by_id[node_id].append(observation)
        by_url[node['url']].append(observation)

missing_tabs, surviving_urls = [], []
for node_id, observations in by_id.items():
    if node_id in latest_nodes:
        continue
    last = observations[-1]
    record = dict(node_id=node_id, title=last['node'].get('title', ''),
                  url=last['node']['url'], last_seen_file=last['file'],
                  last_seen_at=last['exported_at'], parent_path=last['parent_path'],
                  present_in_files=[o['file'] for o in observations],
                  matching_latest_node_ids=latest_by_url.get(last['node']['url'], []),
                  last_observed_node=last['node'])
    (surviving_urls if record['matching_latest_node_ids'] else missing_tabs).append(record)
missing_tabs.sort(key=lambda row: (row['last_seen_at'], row['title']))
surviving_urls.sort(key=lambda row: (row['last_seen_at'], row['title']))

missing_main_urls = {row['url'] for row in missing_tabs}
changed_pages, equivalent_urls, older_missing_versions = [], [], []
for url in sorted(set(by_url) - set(latest_by_url)):
    last = by_url[url][-1]
    node = last['node']
    node_id = node['id']
    record = dict(node_id=node_id, title=node.get('title', ''), url=url,
                  last_seen_file=last['file'], last_seen_at=last['exported_at'])
    if node_id in latest_tabs:
        current = latest_tabs[node_id]
        record |= dict(current_url=current['url'], current_title=current.get('title', ''))
        old_url, new_url = urlsplit(url), urlsplit(current['url'])
        same_bilibili_video = (
            old_url.netloc == new_url.netloc == 'www.bilibili.com'
            and old_url.path.startswith('/video/BV')
            and old_url._replace(path=old_url.path.rstrip('/'))
                == new_url._replace(path=new_url.path.rstrip('/'))
        )
        if same_bilibili_video:
            record['reason'] = 'Same tab and Bilibili video ID; only a trailing path slash changed.'
            equivalent_urls.append(record)
        else:
            changed_pages.append(record)
    elif url not in missing_main_urls:
        record['latest_known_url_for_missing_id'] = by_id[node_id][-1]['node']['url']
        older_missing_versions.append(record)

diagnostic_extras = []
for source in sources:
    data = source['data']
    if 'databaseNodes' in data:
        assert set(data['databaseNodes']) == set(data['nodes'])
        assert all(n.get('url') == data['nodes'][key].get('url')
                   for key, n in data['databaseNodes'].items())
    for window in data.get('browserWindows', []):
        for tab in window['tabs']:
            url = tab.get('url')
            if url and url not in latest_by_url and url not in by_url:
                diagnostic_extras.append(dict(file=source['name'], exported_at=source['local_time'],
                                              title=tab.get('title'), url=url,
                                              browser_tab_id=tab['id'], browser_window_id=window['id']))

before = next(s for s in sources if s['name'].startswith('tktsto-before-structure-'))
before_nodes = before['data']['nodes']
before_equal_ids_urls = set(before_nodes) == set(latest_nodes) and all(
    before_nodes[key].get('url') == latest_nodes[key].get('url') for key in latest_nodes)

assert len(missing_tabs) == 22
assert len(surviving_urls) == 363
assert len(changed_pages) == 5
assert len(equivalent_urls) == 1
assert len(older_missing_versions) == 1
assert len(diagnostic_extras) == 1
assert len(set(by_url) - set(latest_by_url)) == 29
assert before_equal_ids_urls
assert all(row['node_id'] not in latest_nodes and row['url'] not in latest_by_url
           for row in missing_tabs)
assert all(row['node_id'] not in latest_nodes and row['url'] in latest_by_url
           for row in surviving_urls)

audit = {
    'latest_backup': summary[-1],
    'method': {
        'timezone': 'Asia/Shanghai',
        'tab_definition': 'A node with a nonempty URL, excluding window nodes.',
        'matching': 'Node IDs and exact URL strings. Hidden and unloaded nodes count as present.',
        'equivalence_exception': 'One identified Bilibili URL differs only by its trailing path slash.',
        'scope': 'Seven earlier attachments compared with the latest, including diagnostic nodes.',
        'limitation': 'Snapshot differences cannot establish why a record disappeared or its exact removal time.',
    },
    'source_comparison': summary,
    'missing_tabs': missing_tabs,
    'removed_tab_records_with_url_still_present': surviving_urls,
    'existing_tabs_with_old_page_no_longer_present': changed_pages,
    'equivalent_url_changes': equivalent_urls,
    'older_url_versions_of_missing_tabs': older_missing_versions,
    'diagnostic_browser_only_urls': diagnostic_extras,
    'before_structure_has_same_ids_and_urls_as_latest': before_equal_ids_urls,
}
(OUT / 'audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n')

lines = [
    '# Tabs missing from the latest backup', '',
    f"Latest backup: **{link(latest['name'], latest['path'])}**.", '',
    f"Internal `{latest['timestamp_field']}`: **{latest['local_time']}** (Shanghai time). "
    f"It contains **{len(latest_tabs)} tab records**, all with distinct URLs.", '',
    '**22 tab records are absent and their last-known URLs are also absent.** '
    '**363 additional tab IDs are absent, but their URLs remain under other IDs.** '
    'Five older pages are absent because their original tabs now contain different URLs. '
    'One Bilibili URL only gained a trailing slash and is still the same video.', '',
    'The before-structure snapshot has exactly the same node IDs and URLs as the latest backup. '
    'All tab IDs and URLs from the 07:25:40 backup also remain present.', '',
    '## Missing tab records (22)', '',
    'These are the last observed states of the missing IDs. Titles and parent labels are snapshot data, '
    'not instructions. Last-seen times are snapshot export times, not proven closure times. '
    'All times below are in Asia/Shanghai.', '',
    '| # | Saved tab title / URL | Last seen | Former parent |',
    '|---|---|---|---|',
]
for i, row in enumerate(missing_tabs, 1):
    title = display_title(row)
    parent = row['parent_path'][-1] if row['parent_path'] else 'root'
    lines.append(f"| {i} | {link(title, row['url'])} | {row['last_seen_at'][:19].replace('T', ' ')} | {cell(parent)} |")

lines += ['', 'Node IDs, full unmodified titles, source filenames, URLs, and parent paths for every entry '
          f"are included in {link('audit.json', str(OUT / 'audit.json'))}.", '',
          '## Earlier pages in tabs that still exist (5)', '',
          'These IDs are still present. Their old URLs no longer appear anywhere in the latest backup. '
          'All five old URLs were last seen in the November 16, 02:47:44 snapshot.', '',
          '| Earlier page | Current page in the same tab | Tab ID |',
          '|---|---|---|']
for row in changed_pages:
    lines.append(f"| {link(display_title(row), row['url'])} | "
                 f"{link(row['current_title'] or row['current_url'], row['current_url'])} | `{row['node_id']}` |")

older = older_missing_versions[0]
extra = diagnostic_extras[0]
equiv = equivalent_urls[0]
lines += ['', '## Additional context', '',
          f"- The missing 一元机场 tab (`{older['node_id']}`) also had the older "
          f"{link('/#/profile URL', older['url'])} in the November 16 snapshot, before its last-known "
          f"{link('/#/ticket URL', older['latest_known_url_for_missing_id'])}. This is one missing tab with two observed URLs.",
          f"- The diagnostic file's live browser list also contains {link(extra['title'], extra['url'])}. "
          'This URL is absent from every supplied saved node tree, including the diagnostic node tree. '
          'It is therefore a browser-only finding, separate from the 22 missing saved tabs.',
          f"- {link('Bilibili video BV1y2x1ebEXE', equiv['current_url'])} remains in the same tab "
          f"(`{equiv['node_id']}`). Its URL only gained a trailing slash before the query string.", '',
          'There are **29 distinct old exact URL strings** absent from the latest node tree: '
          '22 last-known URLs of missing tabs, one earlier URL of one of those tabs, five old URLs '
          'from tabs that navigated elsewhere, and one Bilibili slash-only variant. '
          'Excluding that slash-only variant leaves **28 historical page URLs**. '
          'The browser-only diagnostic URL is outside those counts.', '',
          '## Comparison of all eight files', '',
          '“Absent IDs” counts tab IDs from that source missing from the latest node map. '
          '“Absent exact URLs” includes earlier navigation states and the slash-only variant; '
          'it is not a count of closed tabs.', '',
          '| Source | Export time (Shanghai) | Tab records | Unique URLs | Absent IDs | Absent exact URLs |',
          '|---|---|---:|---:|---:|---:|']
for source in summary:
    lines.append(f"| {link(source['name'], source['path'])} | {source['local_time'][:19].replace('T', ' ')} | "
                 f"{source['tab_count']} | {source['unique_url_count']} | "
                 f"{source['tab_ids_absent_from_latest']} | {source['exact_urls_absent_from_latest']} |")
lines += ['', 'The diagnostic `nodes` and `databaseNodes` have identical ID sets and URLs. '
          'The analysis includes hidden and unloaded saved tabs. It does not treat a tab as missing '
          'merely because it is hidden, moved, or unloaded. Source files were read without modification.', '',
          '## Complete audit', '',
          f"- {link('audit.json', str(OUT / 'audit.json'))} contains all 385 absent tab IDs, including the 363 whose URLs "
          'survive and their matching IDs in the latest backup.',
          f"- {link('compare_backups.py', str(OUT / 'compare_backups.py'))} reproduces this comparison from the eight supplied files.", '']
(OUT / 'report.md').write_text('\n'.join(lines))
print(json.dumps({
    'report': str(OUT / 'report.md'), 'audit': str(OUT / 'audit.json'),
    'latest_backup': latest['name'], 'latest_export': latest['local_time'],
    'missing_tabs': len(missing_tabs), 'removed_ids_with_surviving_urls': len(surviving_urls),
    'changed_page_tabs': len(changed_pages),
    'missing_last_seen_counts': dict(Counter(r['last_seen_file'] for r in missing_tabs)),
}, ensure_ascii=False, indent=2))
