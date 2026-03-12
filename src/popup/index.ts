import { loadSettings, saveSettings } from '../shared/storage.js';
import type { PopupSummary, ScanSummary } from '../shared/types.js';
import { serializeError } from '../shared/utils.js';

const summaryElement = document.querySelector<HTMLElement>('#summary');
const resultOutput = document.querySelector<HTMLElement>('#result-output');
const scanButton = document.querySelector<HTMLButtonElement>('#scan-button');
const rebuildButton = document.querySelector<HTMLButtonElement>('#rebuild-button');
const clearButton = document.querySelector<HTMLButtonElement>('#clear-button');
const settingsButton = document.querySelector<HTMLButtonElement>('#settings-button');
const autoToggle = document.querySelector<HTMLInputElement>('#auto-toggle');

function assertElement<T>(element: T | null, name: string): T {
  if (!element) {
    throw new Error(`缺少页面元素：${name}`);
  }
  return element;
}

const ui = {
  summaryElement: assertElement(summaryElement, 'summary'),
  resultOutput: assertElement(resultOutput, 'result-output'),
  scanButton: assertElement(scanButton, 'scan-button'),
  rebuildButton: assertElement(rebuildButton, 'rebuild-button'),
  clearButton: assertElement(clearButton, 'clear-button'),
  settingsButton: assertElement(settingsButton, 'settings-button'),
  autoToggle: assertElement(autoToggle, 'auto-toggle')
};

function renderSummary(summary: PopupSummary): void {
  ui.summaryElement.innerHTML = [
    `自动打标：<strong>${summary.enabled ? '已启用' : '已关闭'}</strong>`,
    `Provider：<strong>${summary.providerType === 'chrome-built-in' ? 'Chrome 内置 AI' : 'OpenAI 兼容接口'}</strong>`,
    `分类数：<strong>${summary.categoryCount}</strong>`,
    `当前窗口标签页：<strong>${summary.currentWindowTabCount}</strong>`,
    `累计已打标页面：<strong>${summary.cachedTaggedCount}</strong>`
  ].join('<br />');

  const providerHealth = summary.latestProviderStatus
    ? `最近 Provider 状态：${summary.latestProviderStatus.ok ? '成功' : '失败'} - ${summary.latestProviderStatus.message}`
    : '最近 Provider 状态：暂无';

  const latestLog = summary.latestLog
    ? [
        `最近日志：${summary.latestLog.timestamp} ${summary.latestLog.message}`,
        summary.latestLog.detail ? `日志详情：${summary.latestLog.detail}` : null
      ]
        .filter(Boolean)
        .join('\n')
    : '最近日志：暂无';

  ui.resultOutput.textContent = `${providerHealth}\n${latestLog}`;
}

async function refreshSummary(): Promise<void> {
  const summary = (await chrome.runtime.sendMessage({
    type: 'get-popup-summary'
  })) as PopupSummary;
  ui.autoToggle.checked = summary.enabled;
  renderSummary(summary);
}

async function handleScan(): Promise<void> {
  ui.resultOutput.textContent = '正在扫描当前窗口...';
  try {
    const summary = (await chrome.runtime.sendMessage({
      type: 'manual-scan-current-window'
    })) as ScanSummary;

    ui.resultOutput.textContent = [
      `扫描完成：${summary.scanned} 个标签页`,
      `已打标：${summary.tagged}`,
      `跳过：${summary.skipped}`,
      `错误：${summary.errors}`,
      '',
      ...summary.details
    ].join('\n');

    await refreshSummary();
  } catch (error) {
    ui.resultOutput.textContent = `扫描失败：${serializeError(error)}`;
  }
}

async function handleRebuild(): Promise<void> {
  ui.resultOutput.textContent = '正在重建当前窗口分组...';
  try {
    const summary = (await chrome.runtime.sendMessage({
      type: 'rebuild-current-window'
    })) as ScanSummary;

    ui.resultOutput.textContent = [
      '当前窗口分组已重建。',
      `扫描：${summary.scanned}`,
      `已打标：${summary.tagged}`,
      `跳过：${summary.skipped}`,
      `错误：${summary.errors}`,
      '',
      ...summary.details
    ].join('\n');

    await refreshSummary();
  } catch (error) {
    ui.resultOutput.textContent = `重建失败：${serializeError(error)}`;
  }
}

async function handleClear(): Promise<void> {
  ui.resultOutput.textContent = '正在清除所有标签页分组和打标记录...';
  try {
    const result = (await chrome.runtime.sendMessage({
      type: 'clear-all-grouping-and-records'
    })) as {
      ungroupedTabs: number;
      clearedRecords: number;
      touchedWindows: number;
    };

    ui.resultOutput.textContent = [
      '所有标签页分组和打标记录已清除。',
      `解除分组标签页：${result.ungroupedTabs}`,
      `清除打标记录：${result.clearedRecords}`,
      `涉及窗口：${result.touchedWindows}`
    ].join('\n');

    await refreshSummary();
  } catch (error) {
    ui.resultOutput.textContent = `清除失败：${serializeError(error)}`;
  }
}

ui.scanButton.addEventListener('click', () => {
  void handleScan();
});

ui.rebuildButton.addEventListener('click', () => {
  void handleRebuild();
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
          '自动打标已开启，并已立即执行一次后台扫描。',
          `扫描：${summary.scanned}`,
          `已打标：${summary.tagged}`,
          `跳过：${summary.skipped}`,
          `错误：${summary.errors}`,
          '',
          ...summary.details
        ].join('\n');
      } else {
        ui.resultOutput.textContent = '自动打标已关闭。';
      }
      await refreshSummary();
    } catch (error) {
      ui.autoToggle.checked = !ui.autoToggle.checked;
      ui.resultOutput.textContent = `切换自动打标失败：${serializeError(error)}`;
    }
  })();
});

void refreshSummary();
