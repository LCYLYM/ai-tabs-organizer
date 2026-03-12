import { loadSettings, saveSettings } from '../shared/storage.js';
import { resolveUiLanguage, t } from '../shared/i18n.js';
import type { PopupSummary, ScanSummary, UiLanguage } from '../shared/types.js';
import { serializeError } from '../shared/utils.js';

const summaryElement = document.querySelector<HTMLElement>('#summary');
const resultOutput = document.querySelector<HTMLElement>('#result-output');
const scanButton = document.querySelector<HTMLButtonElement>('#scan-button');
const rebuildButton = document.querySelector<HTMLButtonElement>('#rebuild-button');
const clearCurrentButton = document.querySelector<HTMLButtonElement>('#clear-current-button');
const clearButton = document.querySelector<HTMLButtonElement>('#clear-button');
const settingsButton = document.querySelector<HTMLButtonElement>('#settings-button');
const autoToggle = document.querySelector<HTMLInputElement>('#auto-toggle');
let currentLanguage: UiLanguage = 'zh-CN';

function assertElement<T>(element: T | null, name: string): T {
  if (!element) {
    throw new Error(`Missing required element: ${name}`);
  }
  return element;
}

const ui = {
  summaryElement: assertElement(summaryElement, 'summary'),
  resultOutput: assertElement(resultOutput, 'result-output'),
  scanButton: assertElement(scanButton, 'scan-button'),
  rebuildButton: assertElement(rebuildButton, 'rebuild-button'),
  clearCurrentButton: assertElement(clearCurrentButton, 'clear-current-button'),
  clearButton: assertElement(clearButton, 'clear-button'),
  settingsButton: assertElement(settingsButton, 'settings-button'),
  autoToggle: assertElement(autoToggle, 'auto-toggle')
};

function applyTranslations(): void {
  document.documentElement.lang = currentLanguage;
  document.title = `AI Tabs - ${t(currentLanguage, 'popup.title')}`;

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n as Parameters<typeof t>[1];
    element.textContent = t(currentLanguage, key);
  });
}

function formatProvider(providerType: PopupSummary['providerType']): string {
  return providerType === 'chrome-built-in'
    ? t(currentLanguage, 'popup.provider.chrome')
    : t(currentLanguage, 'popup.provider.openai');
}

function formatLine(label: string, value: string | number): string {
  const separator = currentLanguage === 'zh-CN' ? '：' : ': ';
  return `${label}${separator}${value}`;
}

function renderSummary(summary: PopupSummary): void {
  ui.summaryElement.innerHTML = [
    formatLine(
      t(currentLanguage, 'popup.summary.enabled'),
      `<strong>${summary.enabled ? t(currentLanguage, 'popup.autoEnabled') : t(currentLanguage, 'popup.autoDisabled')}</strong>`
    ),
    formatLine(
      t(currentLanguage, 'popup.summary.provider'),
      `<strong>${formatProvider(summary.providerType)}</strong>`
    ),
    formatLine(t(currentLanguage, 'popup.summary.categoryCount'), `<strong>${summary.categoryCount}</strong>`),
    formatLine(
      t(currentLanguage, 'popup.summary.windowTabCount'),
      `<strong>${summary.currentWindowTabCount}</strong>`
    ),
    formatLine(
      t(currentLanguage, 'popup.summary.cachedTaggedCount'),
      `<strong>${summary.cachedTaggedCount}</strong>`
    )
  ].join('<br />');

  const providerHealth = summary.latestProviderStatus
    ? formatLine(
        t(currentLanguage, 'popup.latestProviderStatus'),
        `${summary.latestProviderStatus.ok ? t(currentLanguage, 'popup.providerStatus.success') : t(currentLanguage, 'popup.providerStatus.failure')} - ${summary.latestProviderStatus.message}`
      )
    : formatLine(t(currentLanguage, 'popup.latestProviderStatus'), t(currentLanguage, 'popup.none'));

  const latestLog = summary.latestLog
    ? [
        formatLine(
          t(currentLanguage, 'popup.latestLog'),
          `${summary.latestLog.timestamp} ${summary.latestLog.message}`
        ),
        summary.latestLog.detail
          ? formatLine(t(currentLanguage, 'popup.logDetail'), summary.latestLog.detail)
          : null
      ]
        .filter(Boolean)
        .join('\n')
    : formatLine(t(currentLanguage, 'popup.latestLog'), t(currentLanguage, 'popup.none'));

  ui.resultOutput.textContent = `${providerHealth}\n${latestLog}`;
}

async function refreshSummary(): Promise<void> {
  const settings = await loadSettings();
  currentLanguage = resolveUiLanguage(settings.language, chrome.i18n.getUILanguage());
  applyTranslations();
  const summary = (await chrome.runtime.sendMessage({
    type: 'get-popup-summary'
  })) as PopupSummary;
  ui.autoToggle.checked = summary.enabled;
  renderSummary(summary);
}

async function handleScan(): Promise<void> {
  ui.resultOutput.textContent = t(currentLanguage, 'popup.scanning');
  try {
    const summary = (await chrome.runtime.sendMessage({
      type: 'manual-scan-current-window'
    })) as ScanSummary;

    ui.resultOutput.textContent = [
      formatLine(t(currentLanguage, 'popup.scanCount'), summary.scanned),
      formatLine(t(currentLanguage, 'popup.taggedCount'), summary.tagged),
      formatLine(t(currentLanguage, 'popup.skippedCount'), summary.skipped),
      formatLine(t(currentLanguage, 'popup.errorCount'), summary.errors),
      '',
      ...summary.details
    ].join('\n');

    await refreshSummary();
  } catch (error) {
    ui.resultOutput.textContent = formatLine(
      t(currentLanguage, 'popup.scanFailed'),
      serializeError(error)
    );
  }
}

async function handleRebuild(): Promise<void> {
  ui.resultOutput.textContent = t(currentLanguage, 'popup.rebuilding');
  try {
    const summary = (await chrome.runtime.sendMessage({
      type: 'rebuild-current-window'
    })) as ScanSummary;

    ui.resultOutput.textContent = [
      t(currentLanguage, 'popup.rebuildDone'),
      formatLine(t(currentLanguage, 'popup.scanCount'), summary.scanned),
      formatLine(t(currentLanguage, 'popup.taggedCount'), summary.tagged),
      formatLine(t(currentLanguage, 'popup.skippedCount'), summary.skipped),
      formatLine(t(currentLanguage, 'popup.errorCount'), summary.errors),
      '',
      ...summary.details
    ].join('\n');

    await refreshSummary();
  } catch (error) {
    ui.resultOutput.textContent = formatLine(
      t(currentLanguage, 'popup.rebuildFailed'),
      serializeError(error)
    );
  }
}

async function handleClearCurrent(): Promise<void> {
  ui.resultOutput.textContent = t(currentLanguage, 'popup.clearingCurrent');
  try {
    const result = (await chrome.runtime.sendMessage({
      type: 'clear-current-window-grouping-and-records'
    })) as {
      ungroupedTabs: number;
      clearedRecords: number;
    };

    ui.resultOutput.textContent = [
      t(currentLanguage, 'popup.clearCurrentDone'),
      formatLine(t(currentLanguage, 'popup.ungroupedTabs'), result.ungroupedTabs),
      formatLine(t(currentLanguage, 'popup.clearedRecords'), result.clearedRecords)
    ].join('\n');

    await refreshSummary();
  } catch (error) {
    ui.resultOutput.textContent = `${t(currentLanguage, 'popup.clearFailed')}：${serializeError(error)}`;
  }
}

async function handleClear(): Promise<void> {
  ui.resultOutput.textContent = t(currentLanguage, 'popup.clearingAll');
  try {
    const result = (await chrome.runtime.sendMessage({
      type: 'clear-all-grouping-and-records'
    })) as {
      ungroupedTabs: number;
      clearedRecords: number;
      touchedWindows: number;
    };

    ui.resultOutput.textContent = [
      t(currentLanguage, 'popup.clearAllDone'),
      formatLine(t(currentLanguage, 'popup.ungroupedTabs'), result.ungroupedTabs),
      formatLine(t(currentLanguage, 'popup.clearedRecords'), result.clearedRecords),
      formatLine(t(currentLanguage, 'popup.touchedWindows'), result.touchedWindows)
    ].join('\n');

    await refreshSummary();
  } catch (error) {
    ui.resultOutput.textContent = formatLine(
      t(currentLanguage, 'popup.clearFailed'),
      serializeError(error)
    );
  }
}

ui.scanButton.addEventListener('click', () => {
  void handleScan();
});

ui.rebuildButton.addEventListener('click', () => {
  void handleRebuild();
});

ui.clearCurrentButton.addEventListener('click', () => {
  void handleClearCurrent();
});

ui.clearButton.addEventListener('click', () => {
  void handleClear();
});

ui.settingsButton.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

ui.autoToggle.addEventListener('change', () => {
  void (async () => {
    try {
      const settings = await loadSettings();
      settings.enabled = ui.autoToggle.checked;
      await saveSettings(settings);
      if (settings.enabled) {
        const summary = (await chrome.runtime.sendMessage({
          type: 'kickoff-auto-scan'
        })) as ScanSummary;
        ui.resultOutput.textContent = [
          t(currentLanguage, 'popup.autoToggleStarted'),
          formatLine(t(currentLanguage, 'popup.scanCount'), summary.scanned),
          formatLine(t(currentLanguage, 'popup.taggedCount'), summary.tagged),
          formatLine(t(currentLanguage, 'popup.skippedCount'), summary.skipped),
          formatLine(t(currentLanguage, 'popup.errorCount'), summary.errors),
          '',
          ...summary.details
        ].join('\n');
      } else {
        ui.resultOutput.textContent = t(currentLanguage, 'popup.autoDisabledMessage');
      }
      await refreshSummary();
    } catch (error) {
      ui.autoToggle.checked = !ui.autoToggle.checked;
      ui.resultOutput.textContent = formatLine(
        t(currentLanguage, 'popup.autoToggleFailed'),
        serializeError(error)
      );
    }
  })();
});

void refreshSummary();
