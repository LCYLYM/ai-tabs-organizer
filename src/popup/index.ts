import type { PopupSummary, ScanSummary } from '../shared/types.js';
import { serializeError } from '../shared/utils.js';

const summaryElement = document.querySelector<HTMLElement>('#summary');
const resultOutput = document.querySelector<HTMLElement>('#result-output');
const scanButton = document.querySelector<HTMLButtonElement>('#scan-button');
const settingsButton = document.querySelector<HTMLButtonElement>('#settings-button');

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
  settingsButton: assertElement(settingsButton, 'settings-button')
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
    ? `最近日志：${summary.latestLog.timestamp} ${summary.latestLog.message}`
    : '最近日志：暂无';

  ui.resultOutput.textContent = `${providerHealth}\n${latestLog}`;
}

async function refreshSummary(): Promise<void> {
  const summary = (await chrome.runtime.sendMessage({
    type: 'get-popup-summary'
  })) as PopupSummary;
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

ui.scanButton.addEventListener('click', () => {
  void handleScan();
});

ui.settingsButton.addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
});

void refreshSummary();
