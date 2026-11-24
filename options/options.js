// options/options.js: options page script
// Copyright (C) 2025 Selene ToyKeeper
// SPDX-License-Identifier: AGPL-3.0-or-later

"use strict";
import { api, isChrome, isFirefox } from '/api.js';

import { log, warn, debug, error, emit, validateBackupFile } from '/common/common.js';
import { ThemedPage } from '/themes/themes.js';
import { settings, settingsDefaults, readSettings, diffSettings, formatSetting } from '/common/settings.js';

log('options.js running');

class OptionsPage extends ThemedPage {

  constructor () {
    super(
      '/docs/docs',
      '/options/options'
    );
    this.$doc = document;
    this.cfgDefaults = { ...settingsDefaults };
  }

  async init () {
    await super.init();

    this.initSessionRestoreForm();

    this.options = [
      new Option(this, {
        cfgKey: 'clientId',
        inputType: 'line',
        fromStr: this.saveClientId,
        debounceTime: 3000,
      }),

      // theme options
      new Option(this, {
        cfgKey: 'theme',
        inputType: 'select',
      }),
      new Option(this, {
        cfgKey: 'expandedRowPrefix',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'alwaysShowNodeStats',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'wasLoadedNodeStats',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'hideTreeLines',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'hideCursorTreeLines',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'hideWindowTreeLines',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'fontFamily',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'indentMargin',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'indentMarginWindow',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'indentPadding',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'indentPaddingWindow',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'expandedBranchBottomPadding',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'leafToBranchSpacing',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'windowTopLevelNodeSpacing',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'detailsBoxHeight',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'detailsBoxHeightNotesOnly',
        inputType: 'line',
        debounceTime: 2000,
      }),
      new Option(this, {
        cfgKey: 'userStyles',
        inputType: 'text',
        debounceTime: 2000,
      }),

      // TreeView behavior
      new Option(this, {
        cfgKey: 'cursorFollowsActiveTab',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'activeTabExpandsItsParents',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'pinnedTabsOpenNewTabsPinnedToo',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'naturalTabOrdering',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'convertFromWindowWhenDroppedIntoWindow',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'hideTopButtonsDuringSearch',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'hideZoomButtons',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'loadCollapsedBranchStyle',
        inputType: 'select',
      }),
      new Option(this, {
        cfgKey: 'loadExpandedBranchStyle',
        inputType: 'select',
      }),
      new Option(this, {
        cfgKey: 'unloadCollapsedBranchStyle',
        inputType: 'select',
      }),
      new Option(this, {
        cfgKey: 'unloadExpandedBranchStyle',
        inputType: 'select',
      }),
      new Option(this, {
        cfgKey: 'deleteExpandedBranchStyle',
        inputType: 'select',
      }),

      // backups
      new Option(this, {
        cfgKey: 'humanFriendlyBackups',
        inputType: 'checkbox',
      }),
      new Option(this, {
        cfgKey: 'localBackupInterval',
        elementId: 'localBackupHours',
        inputType: 'number',
        toStr: (x) => x / 60,
        fromStr: (x) => { return this.parseLocalBackupInterval(x); },
        debounceTime: 3000,
        }),
    ];

    if (isFirefox) {
      this.options.push(
        new Option(this, {
          cfgKey: 'hideCollapsedTabs',
          inputType: 'checkbox',
        })
      );
    } else {
      this.greyOut('hideCollapsedTabs');
    }

    // favicons come from Chromium's _favicon cache, so the option is
    // Chrome-only; grey it out elsewhere
    if (isChrome) {
      this.options.push(
        new Option(this, {
          cfgKey: 'showFavicons',
          inputType: 'checkbox',
        })
      );
    } else {
      this.greyOut('showFavicons');
    }

    for (const option of this.options) {
      option.init();
    }
  }

  saveClientId (value) {
    let clientId = value;
    if (! clientId) return;

    // FIXME: strip everything except letters and numbers from ID

    return clientId;
  }

  parseLocalBackupInterval (value) {
    // input: hours (string)
    // output: minutes (number) or undefined (if invalid)
    // range: 0 to 1000 hours (about 41 days)

    const hours = parseFloat(value);

    // validate the input
    if (isNaN(hours) || hours < 0 || hours > 1000) {
      warn('User entered invalid data into localBackupHours input');
      return;
    }

    return hours * 60;
  }

  initSessionRestoreForm () {
    const doc = this.$doc;
    this.$importPreview = doc.getElementById('backup-import-preview');
    this.$importStatus = doc.getElementById('backup-import-status');
    this.$importSession = doc.getElementById('backup-import-session');
    this.$importConfirm = doc.getElementById('backup-import-confirm');
    this.$importSession.addEventListener('change', () => this.updateImportSelection());
    this.$importConfirm.addEventListener('click', () => this.importReviewedBackup());
    doc.getElementById('backup-import-cancel').addEventListener('click', () => {
      this.clearImportPreview();
      this.$importStatus.textContent = 'Import cancelled. Nothing was changed.';
    });
    for (const [id, checked] of [['backup-select-all', true], ['backup-select-none', false]]) {
      doc.getElementById(id).addEventListener('click', () => {
        for (const checkbox of this.importCheckboxes) checkbox.checked = checked;
        this.updateImportSelection();
      });
    }
    doc.getElementById('tktsto-file-input').addEventListener('change', () => {
      this.clearImportPreview();
      this.$importStatus.textContent = '';
    });
    for (const [base, isTktsto] of [['tktsto-file', true], ['tabs-outliner-file', false]]) {
      const button = doc.getElementById(`${base}-button`);
      button.addEventListener('click', async () => {
        const fileInput = doc.getElementById(`${base}-input`);
        const file = fileInput.files[0];
        if (!file) {
          this.$importStatus.textContent = 'Please select a JSON file first.';
          return;
        }
        if (isTktsto) this.clearImportPreview();
        const originalText = button.textContent;
        button.disabled = true;
        fileInput.disabled = true;
        button.textContent = 'Loading…';
        this.$importStatus.textContent = '';
        try {
          // Some browsers report an empty MIME type for JSON files.
          const json = JSON.parse(await file.text());
          if (isTktsto) {
            await this.reviewBackup(json, file.name);
          } else {
            const response = await emit('bkgd_importTabsOutliner', { data: json, filename: file.name });
            if (!response || response.error || response.total < 0)
              throw new Error(response?.error || 'The session could not be imported.');
            this.$importStatus.textContent = `${response.total} nodes imported from “${file.name}”.`;
          }
        } catch (err) {
          warn('Import failed:', err);
          this.$importStatus.textContent = `Could not import “${file.name}”: ${err.message}`;
        } finally {
          button.disabled = false;
          fileInput.disabled = false;
          button.textContent = originalText;
        }
      });
    }
    this.clearImportPreview();
  }

  clearImportPreview () {
    this.pendingBackup = null;
    this.importCheckboxes = [];
    this.$importPreview.hidden = true;
    this.$doc.getElementById('backup-settings-diff').replaceChildren();
  }

  async reviewBackup (data, filename) {
    validateBackupFile(data);
    // Finish edits still waiting on a debounce before comparing saved values.
    await Promise.all(this.options.filter(option => option.debounceTimer)
      .map(option => option.parseAndSave()));
    const { changes, ignored } = diffSettings(data.settings, await readSettings());
    const doc = this.$doc;
    this.pendingBackup = { data, filename };
    doc.getElementById('backup-import-filename').textContent = filename;
    this.$importSession.checked = true;
    doc.getElementById('backup-settings-summary').textContent = data.settings === undefined
      ? 'This older backup has no settings. Your current settings will be kept.'
      : changes.length
        ? `${changes.length} changed settings. Only checked settings will be imported.`
        : 'No settings changes. Your current settings will be kept.';
    doc.getElementById('backup-settings-ignored').textContent = ignored.length
      ? `Skipped unknown or invalid settings: ${ignored.join(', ')}.` : '';
    doc.getElementById('backup-settings-table').hidden = !changes.length;
    doc.getElementById('backup-settings-actions').hidden = !changes.length;
    const body = doc.getElementById('backup-settings-diff');
    for (const change of changes) {
      const row = doc.createElement('tr');
      const name = doc.createElement('th');
      name.scope = 'row';
      const label = doc.createElement('label');
      const checkbox = doc.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.setting = change.key;
      // IDs must remain unique when combining sessions from different browsers.
      checkbox.checked = change.key !== 'clientId';
      checkbox.addEventListener('change', () => this.updateImportSelection());
      this.importCheckboxes.push(checkbox);
      label.append(checkbox, ` ${settings[change.key].label}`);
      name.append(label);
      if (change.key === 'clientId') {
        const note = doc.createElement('small');
        note.textContent = 'Each browser should keep a unique client ID.';
        name.append(note);
      }
      row.append(name);
      for (const [kind, value] of [['current', change.current], ['incoming', change.incoming]]) {
        const cell = doc.createElement('td');
        const text = doc.createElement('pre');
        text.className = `setting-value setting-${kind}`;
        text.textContent = formatSetting(change.key, value);
        cell.append(text);
        row.append(cell);
      }
      body.append(row);
    }
    this.$importPreview.hidden = false;
    this.updateImportSelection();
    doc.getElementById('backup-import-title').focus();
  }

  updateImportSelection () {
    const count = this.importCheckboxes.filter(checkbox => checkbox.checked).length;
    this.$doc.getElementById('backup-settings-selected').textContent = `${count} settings selected`;
    this.$importConfirm.disabled = !this.$importSession.checked && !count;
  }

  async importReviewedBackup () {
    if (!this.pendingBackup || this.importingBackup) return;
    const { data, filename } = this.pendingBackup;
    const settingsKeys = this.importCheckboxes.filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.dataset.setting);
    const importSession = this.$importSession.checked;
    if (!importSession && !settingsKeys.length) return;
    this.importingBackup = true;
    const controls = [...this.$importPreview.querySelectorAll('input, button'),
      this.$doc.getElementById('tktsto-file-input'), this.$doc.getElementById('tktsto-file-button')];
    controls.forEach(control => { control.disabled = true; });
    this.$importStatus.textContent = 'Importing…';
    try {
      const response = await emit('bkgd_importBackupFile', { data, filename, settingsKeys, importSession });
      if (!response) throw new Error('The background service did not respond.');
      if (response.error) {
        // A settings write can fail after the session was successfully added.
        // Do not offer to add the same session again on retry.
        if (response.sessionImported) this.$importSession.checked = false;
        throw new Error(`${response.total} nodes imported; ${response.error}`);
      }
      // Refresh controls even if the storage change notification is delayed.
      for (const option of this.options) {
        if (settingsKeys.includes(option.cfgKey)) {
          const value = data.settings[option.cfgKey];
          option.cfg[option.cfgKey] = value;
          option.showSavedValue(value);
        }
      }
      this.clearImportPreview();
      this.$importStatus.textContent = `${response.total} nodes and ${response.settingsImported} settings imported from “${filename}”.`;
    } catch (err) {
      warn('Import failed:', err);
      this.$importStatus.textContent = `Import failed: ${err.message}`;
    } finally {
      this.importingBackup = false;
      controls.forEach(control => { control.disabled = false; });
      this.updateImportSelection();
    }
  }

  greyOut (elementId) {
    const $elem = this.$doc.getElementById(elementId);
    if (! $elem) return warn(`No such page element: ${elementId}`);
    $elem.disabled = true;
    let $grey = $elem.parentElement;
    if (! $grey) $grey = $elem;
    $grey.classList.add('greyed-out');
  }

}

class Option {
  constructor (page, args) {
    this.page = page;
    this.cfg = page.cfg;
    this.cfgKey = args.cfgKey;
    if (undefined !== args.elementId) this.elementId = args.elementId;
    else this.elementId = this.cfgKey;
    this.inputType = args.inputType;
    this.toStr = args.toStr;  // convert to string for display
    this.fromStr = args.fromStr;  // process user-submitted values
    this.debounceTime = args.debounceTime;
    this.debounceTimer = null;
  }

  init () {
    const doc = this.page.$doc;
    const cfg = this.cfg;
    const $elem = doc.getElementById(this.elementId);
    if (! $elem) return error(`No such page element: ${this.elementId}`);
    this.$elem = $elem;

    debug(`${this.inputType}: ${this.cfgKey} = ${cfg[this.cfgKey]}`);

    // convert saved value to a string for display
    let valueStr = cfg[this.cfgKey];
    if (this.toStr) valueStr = this.toStr(valueStr);

    this.setValue(valueStr);
    cfg.watch(this.cfgKey, (key, newValue) => this.showSavedValue(newValue));

    // save changes when relevant event fires
    let eventName = 'input';
    if ('checkbox' === this.inputType) eventName = 'click';
    else if ('select' === this.inputType) eventName = 'change';

    $elem.addEventListener(eventName, (event) => {
      if (! this.debounceTime) {
        this.parseAndSave();
      } else {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        // visually mark it as unsaved until the timer expires
        this.$elem.classList.add('unsaved');
        this.debounceTimer = setTimeout(() => {
          this.parseAndSave();
        }, this.debounceTime);
      }
    });
  }

  getValue () {
    if (['line', 'text', 'number', 'select'].includes(this.inputType)) {
      return this.$elem.value;
    }
    else if ('checkbox' === this.inputType) {
      return this.$elem.checked;
    }
  }

  setValue (value) {
    if (['line', 'text', 'number', 'select'].includes(this.inputType)) {
      this.$elem.value = value;
    }
    else if ('checkbox' === this.inputType) {
      this.$elem.checked = value;
    }
  }

  showSavedValue (value) {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.setValue(this.toStr ? this.toStr(value) : value);
    this.$elem.classList.remove('unsaved');
  }

  async parseAndSave () {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    const rawValue = this.getValue();
    let value = rawValue;
    if (this.fromStr) value = this.fromStr(value);
    if (undefined !== value) {
      await this.cfg.set(this.cfgKey, value);

      // update widget with sanitized value
      let valueStr = value;
      if (this.toStr) valueStr = this.toStr(valueStr);
      if (valueStr !== rawValue) this.setValue(valueStr);

      // remove 'unsaved' status
      this.$elem.classList.remove('unsaved');
    }
  }
}

// pre-populate form with saved user options,
// and store new values when the user hits "save"
document.addEventListener('DOMContentLoaded', () => {
  const optionsPage = new OptionsPage();
  optionsPage.init();
  log('options.js loaded');
});

