import { TAB_GROUP_COLOR_OPTIONS } from '../shared/constants.js';
import { getChromeBuiltInAvailability, warmupChromeBuiltInModel } from '../shared/chrome-built-in-provider.js';
import {
  clearClassificationCache,
  loadClassificationCache,
  loadSettings,
  saveProviderHealth,
  saveSettings
} from '../shared/storage.js';
import type { AppSettings, CategoryRule, ClassificationCacheRecord, ScanSummary } from '../shared/types.js';
import { prettyJson, sanitizeCategories, serializeError } from '../shared/utils.js';

const categoriesInput = document.querySelector<HTMLTextAreaElement>('#categories-input');
const promptInput = document.querySelector<HTMLTextAreaElement>('#prompt-input');
const providerSelect = document.querySelector<HTMLSelectElement>('#provider-select');
const baseUrlInput = document.querySelector<HTMLInputElement>('#base-url-input');
const apiKeyInput = document.querySelector<HTMLInputElement>('#api-key-input');
const modelInput = document.querySelector<HTMLInputElement>('#model-input');
const temperatureInput = document.querySelector<HTMLInputElement>('#temperature-input');
const topKInput = document.querySelector<HTMLInputElement>('#topk-input');
const enabledInput = document.querySelector<HTMLInputElement>('#enabled-input');
const contentLimitInput = document.querySelector<HTMLInputElement>('#content-limit-input');
const alarmMinutesInput = document.querySelector<HTMLInputElement>('#alarm-minutes-input');
const saveButton = document.querySelector<HTMLButtonElement>('#save-button');
const statusOutput = document.querySelector<HTMLElement>('#status-output');
const providerOpenAi = document.querySelector<HTMLElement>('#provider-openai');
const providerChrome = document.querySelector<HTMLElement>('#provider-chrome');
const testProviderButton = document.querySelector<HTMLButtonElement>('#test-provider-button');
const runNowButton = document.querySelector<HTMLButtonElement>('#run-now-button');
const categoryRulesContainer = document.querySelector<HTMLElement>('#category-rules');
const historyPanel = document.querySelector<HTMLElement>('#history-panel');
const refreshHistoryButton = document.querySelector<HTMLButtonElement>('#refresh-history-button');
const clearHistoryButton = document.querySelector<HTMLButtonElement>('#clear-history-button');

function assertElement<T>(element: T | null, name: string): T {
  if (!element) {
    throw new Error(`缺少页面元素：${name}`);
  }
  return element;
}

const ui = {
  categoriesInput: assertElement(categoriesInput, 'categories-input'),
  promptInput: assertElement(promptInput, 'prompt-input'),
  providerSelect: assertElement(providerSelect, 'provider-select'),
  baseUrlInput: assertElement(baseUrlInput, 'base-url-input'),
  apiKeyInput: assertElement(apiKeyInput, 'api-key-input'),
  modelInput: assertElement(modelInput, 'model-input'),
  temperatureInput: assertElement(temperatureInput, 'temperature-input'),
  topKInput: assertElement(topKInput, 'topk-input'),
  enabledInput: assertElement(enabledInput, 'enabled-input'),
  contentLimitInput: assertElement(contentLimitInput, 'content-limit-input'),
  alarmMinutesInput: assertElement(alarmMinutesInput, 'alarm-minutes-input'),
  saveButton: assertElement(saveButton, 'save-button'),
  statusOutput: assertElement(statusOutput, 'status-output'),
  providerOpenAi: assertElement(providerOpenAi, 'provider-openai'),
  providerChrome: assertElement(providerChrome, 'provider-chrome'),
  testProviderButton: assertElement(testProviderButton, 'test-provider-button'),
  runNowButton: assertElement(runNowButton, 'run-now-button'),
  categoryRulesContainer: assertElement(categoryRulesContainer, 'category-rules'),
  historyPanel: assertElement(historyPanel, 'history-panel'),
  refreshHistoryButton: assertElement(refreshHistoryButton, 'refresh-history-button'),
  clearHistoryButton: assertElement(clearHistoryButton, 'clear-history-button')
};

function setStatus(message: string): void {
  ui.statusOutput.textContent = message;
}

function toggleProviderPanels(providerType: AppSettings['providerType']): void {
  const useOpenAi = providerType === 'openai-compatible';
  ui.providerOpenAi.hidden = !useOpenAi;
  ui.providerChrome.hidden = useOpenAi;
}

function readSettingsFromForm(): AppSettings {
  const categories = sanitizeCategories(ui.categoriesInput.value.split('\n'));
  return {
    enabled: ui.enabledInput.checked,
    categories,
    categoryRules: readCategoryRulesFromForm(categories),
    promptSupplement: ui.promptInput.value.trim(),
    providerType:
      ui.providerSelect.value === 'chrome-built-in' ? 'chrome-built-in' : 'openai-compatible',
    openAiCompatible: {
      baseUrl: ui.baseUrlInput.value.trim(),
      apiKey: ui.apiKeyInput.value.trim(),
      model: ui.modelInput.value.trim()
    },
    chromeBuiltIn: {
      temperature: Number.parseFloat(ui.temperatureInput.value),
      topK: Number.parseInt(ui.topKInput.value, 10)
    },
    contentCharacterLimit: Number.parseInt(ui.contentLimitInput.value, 10),
    alarmPeriodMinutes: Number.parseInt(ui.alarmMinutesInput.value, 10)
  };
}

function writeSettingsToForm(settings: AppSettings): void {
  ui.categoriesInput.value = settings.categories.join('\n');
  renderCategoryRules(settings.categories, settings.categoryRules);
  ui.promptInput.value = settings.promptSupplement;
  ui.providerSelect.value = settings.providerType;
  ui.baseUrlInput.value = settings.openAiCompatible.baseUrl;
  ui.apiKeyInput.value = settings.openAiCompatible.apiKey;
  ui.modelInput.value = settings.openAiCompatible.model;
  ui.temperatureInput.value = String(settings.chromeBuiltIn.temperature);
  ui.topKInput.value = String(settings.chromeBuiltIn.topK);
  ui.enabledInput.checked = settings.enabled;
  ui.contentLimitInput.value = String(settings.contentCharacterLimit);
  ui.alarmMinutesInput.value = String(settings.alarmPeriodMinutes);
  toggleProviderPanels(settings.providerType);
}

function readCategoryRulesFromForm(categories: string[]): Record<string, CategoryRule> {
  const rules: Record<string, CategoryRule> = {};
  for (const category of categories) {
    const safeKey = encodeURIComponent(category);
    const colorSelect = ui.categoryRulesContainer.querySelector<HTMLSelectElement>(
      `[data-rule-color="${safeKey}"]`
    );
    const collapsedInput = ui.categoryRulesContainer.querySelector<HTMLInputElement>(
      `[data-rule-collapsed="${safeKey}"]`
    );

    rules[category] = {
      color: (colorSelect?.value as CategoryRule['color'] | undefined) ?? 'auto',
      collapsed: Boolean(collapsedInput?.checked)
    };
  }
  return rules;
}

function renderCategoryRules(
  categories: string[],
  rules: Record<string, CategoryRule> | undefined
): void {
  if (categories.length === 0) {
    ui.categoryRulesContainer.innerHTML = '<p class="hint">先输入分类名称，才能配置分组规则。</p>';
    return;
  }

  ui.categoryRulesContainer.innerHTML = categories
    .map((category) => {
      const safeKey = encodeURIComponent(category);
      const rule = rules?.[category];
      const colorOptions = [
        '<option value="auto">自动配色</option>',
        ...TAB_GROUP_COLOR_OPTIONS.map(
          (color) =>
            `<option value="${color}"${rule?.color === color ? ' selected' : ''}>${color}</option>`
        )
      ].join('');

      return `
        <article class="rule-item">
          <div class="rule-head">
            <div class="rule-title">${escapeHtml(category)}</div>
          </div>
          <div class="rule-grid">
            <label class="field">
              <span>分组颜色</span>
              <select data-rule-color="${safeKey}">
                ${colorOptions}
              </select>
            </label>
            <label class="checkbox">
              <input type="checkbox" data-rule-collapsed="${safeKey}"${rule?.collapsed ? ' checked' : ''} />
              <span>打标后默认折叠</span>
            </label>
          </div>
        </article>
      `;
    })
    .join('');
}

async function refreshHistory(): Promise<void> {
  const cache = await loadClassificationCache();
  const items = Object.values(cache)
    .sort((left, right) => right.taggedAt.localeCompare(left.taggedAt))
    .slice(0, 80);

  renderHistory(items);
}

function renderHistory(items: ClassificationCacheRecord[]): void {
  if (items.length === 0) {
    ui.historyPanel.innerHTML = '<p class="hint">暂无历史记录。</p>';
    return;
  }

  ui.historyPanel.innerHTML = items
    .map((item) => {
      const evidence = Array.isArray(item.evidence) ? item.evidence : [];
      const headings = Array.isArray(item.headings) ? item.headings : [];
      return `
        <article class="history-item">
          <div class="history-head">
            <div class="history-title">${escapeHtml(item.category)}</div>
            <div class="history-meta">${new Date(item.taggedAt).toLocaleString('zh-CN')}</div>
          </div>
          <div class="history-meta">
            标题：${escapeHtml(item.title || '(无标题)')}<br />
            域名：${escapeHtml(item.domain || '(未知域名)')}<br />
            Provider：${item.providerType === 'chrome-built-in' ? 'Chrome 内置 AI' : 'OpenAI 兼容接口'}<br />
            置信度：${item.confidence == null ? '未提供' : item.confidence.toFixed(2)}<br />
            主导信号：${escapeHtml(item.dominantSignal || 'insufficient')}<br />
            内容读取：${item.accessMode === 'full' ? '标题 + 域名 + 正文' : '标题 + 域名（正文不可读取）'}<br />
            分组 ID：${item.groupId ?? '无'}
          </div>
          <div class="history-meta">判断理由：${escapeHtml(item.reason || '模型未提供理由')}</div>
          <div class="history-meta">关键证据：${evidence.length > 0 ? escapeHtml(evidence.join(' | ')) : '模型未提供证据'}</div>
          <div class="history-meta">标题摘要：${headings.length > 0 ? escapeHtml(headings.join(' | ')) : '(未读取到标题层级)'}</div>
          <div class="history-meta">正文摘要：${escapeHtml(item.contentExcerpt || '(未读取到正文内容)')}</div>
          <div class="history-url"><a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></div>
        </article>
      `;
    })
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

async function handleSave(): Promise<void> {
  ui.saveButton.disabled = true;
  try {
    const saved = await saveSettings(readSettingsFromForm());
    writeSettingsToForm(saved);
    setStatus(`保存成功。\n${prettyJson(saved)}`);
  } catch (error) {
    setStatus(`保存失败：${serializeError(error)}`);
  } finally {
    ui.saveButton.disabled = false;
  }
}

async function handleProviderTest(): Promise<void> {
  setStatus('正在执行 Provider 测试...');
  try {
    const settings = await saveSettings(readSettingsFromForm());
    if (settings.providerType === 'chrome-built-in') {
      const availability = await getChromeBuiltInAvailability(settings.chromeBuiltIn);
      const warmupMessage = availability === 'available' ? '模型已就绪。' : await warmupChromeBuiltInModel(settings.chromeBuiltIn);
      const message = `Chrome 内置 AI 测试成功。\navailability=${availability}\n${warmupMessage}`;
      await saveProviderHealth({
        checkedAt: new Date().toISOString(),
        providerType: 'chrome-built-in',
        ok: true,
        message
      });
      setStatus(message);
      return;
    }

    const response = (await chrome.runtime.sendMessage({
      type: 'test-openai-provider'
    })) as { ok: boolean; result?: string; error?: string };

    if (!response.ok) {
      throw new Error(response.error ?? 'OpenAI 兼容 Provider 测试失败。');
    }

    setStatus(response.result ?? 'Provider 测试完成。');
  } catch (error) {
    setStatus(`Provider 测试失败：${serializeError(error)}`);
  }
}

async function handleRunNow(): Promise<void> {
  setStatus('正在扫描当前窗口...');
  try {
    const summary = (await chrome.runtime.sendMessage({
      type: 'manual-scan-current-window'
    })) as ScanSummary;

    setStatus(
      [
        `扫描完成：共 ${summary.scanned} 个标签页`,
        `已打标：${summary.tagged}`,
        `跳过：${summary.skipped}`,
        `错误：${summary.errors}`,
        '',
        ...summary.details
      ].join('\n')
    );
    await refreshHistory();
  } catch (error) {
    setStatus(`扫描失败：${serializeError(error)}`);
  }
}

async function handleClearHistory(): Promise<void> {
  await clearClassificationCache();
  await refreshHistory();
  setStatus('分类历史已清空。');
}

ui.providerSelect.addEventListener('change', () => {
  toggleProviderPanels(
    ui.providerSelect.value === 'chrome-built-in' ? 'chrome-built-in' : 'openai-compatible'
  );
});

ui.categoriesInput.addEventListener('input', () => {
  const categories = sanitizeCategories(ui.categoriesInput.value.split('\n'));
  const currentRules = readCategoryRulesFromForm(categories);
  renderCategoryRules(categories, currentRules);
});

ui.saveButton.addEventListener('click', () => {
  void handleSave();
});

ui.testProviderButton.addEventListener('click', () => {
  void handleProviderTest();
});

ui.runNowButton.addEventListener('click', () => {
  void handleRunNow();
});

ui.refreshHistoryButton.addEventListener('click', () => {
  void refreshHistory();
});

ui.clearHistoryButton.addEventListener('click', () => {
  void handleClearHistory();
});

void (async () => {
  const settings = await loadSettings();
  writeSettingsToForm(settings);
  await refreshHistory();
  setStatus('设置已加载。');
})();
