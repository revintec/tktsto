// common/settings.js: portable user settings and backup validation
// Copyright (C) 2026 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api } from '/api.js';

// Explicitly list preferences: storage also contains browser/session state,
// backup timestamps, and per-window cursors which must not be restored.
export const settings = {
  clientId: { label: 'Client ID', default: null,
    validate: value => typeof value === 'string' && /^[a-z0-9]{1,8}$/.test(value) },
  theme: { label: 'Theme', default: 'TK Night', choices: ['TK Night', 'TK Day'] },
  expandedRowPrefix: { label: 'Show + before expanded branches', default: false },
  alwaysShowNodeStats: { label: 'Show node stats', default: true },
  wasLoadedNodeStats: { label: 'Include previously loaded tabs in node stats', default: true },
  showFavicons: { label: 'Show favicons', default: true },
  hideTreeLines: { label: 'Hide tree lines', default: false },
  hideCursorTreeLines: { label: 'Hide cursor branch tree lines', default: false },
  hideWindowTreeLines: { label: 'Hide window tree lines', default: true },
  flattenLoneChild: { label: 'Flatten lone children', default: true },
  fontFamily: { label: 'Font family', default: '' },
  indentMargin: { label: 'Indent margin', default: '' },
  indentMarginWindow: { label: 'Window indent margin', default: '' },
  indentPadding: { label: 'Indent padding', default: '' },
  indentPaddingWindow: { label: 'Window indent padding', default: '' },
  expandedBranchBottomPadding: { label: 'Expanded branch bottom padding', default: '' },
  leafToBranchSpacing: { label: 'Space between leaf and branch', default: '' },
  windowTopLevelNodeSpacing: { label: 'Window top-level node spacing', default: '' },
  detailsBoxHeight: { label: 'Details box height', default: '' },
  detailsBoxHeightNotesOnly: { label: 'Details box height (notes)', default: '' },
  userStyles: { label: 'User stylesheet', default: '' },
  cursorFollowsActiveTab: { label: 'Cursor follows active tab', default: true },
  activeTabExpandsItsParents: { label: 'Active tab expands its parents', default: true },
  pinnedTabsOpenNewTabsPinnedToo: { label: 'Pin new tabs opened from pinned tabs', default: false },
  naturalTabOrdering: { label: 'Natural tab ordering', default: true },
  convertFromWindowWhenDroppedIntoWindow: { label: 'Convert windows moved into windows to headings', default: true },
  hideTopButtonsDuringSearch: { label: 'Hide top buttons during search', default: false },
  hideZoomButtons: { label: 'Replace zoom buttons with Flatten', default: true },
  hideCollapsedTabs: { label: 'Hide collapsed tabs (Firefox)', default: false },
  hideCollapsedTabGroups: { label: 'Hide collapsed tab groups', default: true },
  loadExpandedBranchStyle: { label: 'Load expanded branches', default: 'ask', choices: ['ask', 'one', 'all'] },
  loadCollapsedBranchStyle: { label: 'Load collapsed branches', default: 'ask', choices: ['ask', 'one', 'all'] },
  unloadExpandedBranchStyle: { label: 'Unload expanded branches', default: 'ask', choices: ['ask', 'one', 'all'] },
  unloadCollapsedBranchStyle: { label: 'Unload collapsed branches', default: 'ask', choices: ['ask', 'one', 'all'] },
  deleteExpandedBranchStyle: { label: 'Delete expanded branches', default: 'ask', choices: ['ask', 'one', 'all'] },
  treeViewZoomLevel: { label: 'Tree view zoom', default: 0.75, min: 1 / 3, max: 3 },
  nodesPerPage: { label: 'Nodes per page', default: 20, min: 1, integer: true },
  doubleClickMs: { label: 'Double-click delay (milliseconds)', default: 500, min: 0 },
  humanFriendlyBackups: { label: 'Human readable backups', default: false },
  localBackupInterval: { label: 'Automatic backup interval (hours)', default: 0, min: 0, max: 60000 },
};

export const settingsDefaults = Object.fromEntries(
  Object.entries(settings).map(([key, setting]) => [key, setting.default]));

export function isValidSetting (key, value) {
  if (!Object.hasOwn(settings, key)) return false;
  const setting = settings[key];
  if (setting.validate) return setting.validate(value);
  if (typeof value !== typeof setting.default) return false;
  if (setting.choices) return setting.choices.includes(value);
  if (typeof value === 'number') {
    return Number.isFinite(value)
      && (setting.min === undefined || value >= setting.min)
      && (setting.max === undefined || value <= setting.max)
      && (!setting.integer || Number.isInteger(value));
  }
  return true;
}

export async function readSettings () {
  return api.storage.local.get(settingsDefaults);
}

export function diffSettings (incoming, current) {
  if (incoming === undefined) return { changes: [], ignored: [] };
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming))
    throw new Error('The backup settings must be a JSON object.');
  const changes = [], ignored = [];
  for (const [key, value] of Object.entries(incoming)) {
    if (!isValidSetting(key, value)) {
      ignored.push(key);
      continue;
    }
    if (value !== current[key]) changes.push({ key, current: current[key], incoming: value });
  }
  return { changes, ignored };
}

export function selectSettings (incoming, keys = []) {
  if (!Array.isArray(keys)) throw new Error('Select settings using a list of keys.');
  const selected = {};
  for (const key of keys) {
    if (typeof key !== 'string' || !incoming || !Object.hasOwn(incoming, key)
        || !isValidSetting(key, incoming[key]))
      throw new Error(`Invalid setting selected for import: ${key}`);
    selected[key] = incoming[key];
  }
  return selected;
}

export function formatSetting (key, value) {
  if (value === null || value === undefined) return '(not set)';
  if (value === '') return key === 'userStyles' ? '(empty)' : '(theme default)';
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (key === 'localBackupInterval') return value ? `${value / 60} hours` : 'Disabled';
  if (key === 'treeViewZoomLevel') return `${Math.round(value * 100)}%`;
  return String(value);
}
