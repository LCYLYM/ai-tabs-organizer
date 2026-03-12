import { TAB_GROUP_COLOR_OPTIONS } from '../shared/constants.js';
import { getChromeBuiltInAvailability, warmupChromeBuiltInModel } from '../shared/chrome-built-in-provider.js';
import { resolveUiLanguage, t } from '../shared/i18n.js';
import {
  clearClassificationCache,
  loadClassificationCache,
  loadSettings,
  saveProviderHealth,
  saveSettings
} from '../shared/storage.js';
import type {
  AppSettings,
  CategoryRule,
  ClassificationCacheRecord,
  DominantSignal,
  ScanSummary,
  UiLanguage
} from '../shared/types.js';
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
const languageSelect = document.querySelector<HTMLSelectElement>('#language-select');
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

let currentLanguage: UiLanguage = 'zh-CN';

function assertElement<T>(element: T | null, name: string): T {
  if (!element) {
    throw new Error(`Missing required element: ${name}`);
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
  languageSelect: assertElement(languageSelect, 'language-select'),
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

function applyTranslations(): void {
  document.documentElement.lang = currentLanguage;
  document.title = `${t(currentLanguage, 'options.title')} - AI Tabs`;

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n as Parameters<typeof t>[1];
    element.textContent = t(currentLanguage, key);
  });

  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-i18n-placeholder]').forEach((element) => {
    const key = element.dataset.i18nPlaceholder as Parameters<typeof t>[1];
    element.placeholder = t(currentLanguage, key);
  });
}

function setStatus(message: string): void {
  ui.statusOutput.textContent = message;
}

function formatLine(label: string, value: string | number): string {
  const separator = currentLanguage === 'zh-CN' ? '：' : ': ';
  return `${label}${separator}${value}`;
}

function formatDominantSignal(signal: DominantSignal | undefined): string {
  switch (signal) {
    case 'title':
      return t(currentLanguage, 'signal.title');
    case 'domain':
      return t(currentLanguage, 'signal.domain');
    case 'content':
      return t(currentLanguage, 'signal.content');
    case 'mixed':
      return t(currentLanguage, 'signal.mixed');
    default:
      return t(currentLanguage, 'signal.insufficient');
  }
}

function resolveLanguageSetting(language: string): UiLanguage {
  return language === 'zh-CN' || language === 'en' ? language : 'auto';
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
    language: resolveLanguageSetting(ui.languageSelect.value),
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
  currentLanguage = resolveUiLanguage(settings.language, chrome.i18n.getUILanguage());
  applyTranslations();

  ui.categoriesInput.value = settings.categories.join('\n');
  ui.promptInput.value = settings.promptSupplement;
  ui.providerSelect.value = settings.providerType;
  ui.baseUrlInput.value = settings.openAiCompatible.baseUrl;
  ui.apiKeyInput.value = settings.openAiCompatible.apiKey;
  ui.modelInput.value = settings.openAiCompatible.model;
  ui.temperatureInput.value = String(settings.chromeBuiltIn.temperature);
  ui.topKInput.value = String(settings.chromeBuiltIn.topK);
  ui.enabledInput.checked = settings.enabled;
  ui.languageSelect.value = settings.language;
  ui.contentLimitInput.value = String(settings.contentCharacterLimit);
  ui.alarmMinutesInput.value = String(settings.alarmPeriodMinutes);
  toggleProviderPanels(settings.providerType);
  renderCategoryRules(settings.categories, settings.categoryRules);
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

function renderCategoryRules(categories: string[], rules: Record<string, CategoryRule> | undefined): void {
  if (categories.length === 0) {
    ui.categoryRulesContainer.innerHTML = `<p class="hint">${t(currentLanguage, 'options.rulesHint')}</p>`;
    return;
  }

  ui.categoryRulesContainer.innerHTML = categories
    .map((category) => {
      const safeKey = encodeURIComponent(category);
      const rule = rules?.[category];
      const colorOptions = [
        `<option value="auto">${t(currentLanguage, 'options.ruleAutoColor')}</option>`,
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
              <span>${t(currentLanguage, 'options.ruleColor')}</span>
              <select data-rule-color="${safeKey}">
                ${colorOptions}
              </select>
            </label>
            <label class="checkbox">
              <input type="checkbox" data-rule-collapsed="${safeKey}"${rule?.collapsed ? ' checked' : ''} />
              <span>${t(currentLanguage, 'options.ruleCollapsed')}</span>
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
    ui.historyPanel.innerHTML = `<p class="hint">${t(currentLanguage, 'options.history.empty')}</p>`;
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
            <div class="history-meta">${new Date(item.taggedAt).toLocaleString(currentLanguage === 'zh-CN' ? 'zh-CN' : 'en-US')}</div>
          </div>
          <div class="history-meta">
            ${formatLine(t(currentLanguage, 'options.history.title'), escapeHtml(item.title || t(currentLanguage, 'common.noTitle')))}<br />
            ${formatLine(t(currentLanguage, 'options.history.domain'), escapeHtml(item.domain || t(currentLanguage, 'common.unknownDomain')))}<br />
            ${formatLine(
              t(currentLanguage, 'options.history.provider'),
              item.providerType === 'chrome-built-in'
                ? t(currentLanguage, 'popup.provider.chrome')
                : t(currentLanguage, 'popup.provider.openai')
            )}<br />
            ${formatLine(
              t(currentLanguage, 'options.history.confidence'),
              item.confidence == null ? t(currentLanguage, 'common.notProvided') : item.confidence.toFixed(2)
            )}<br />
            ${formatLine(
              t(currentLanguage, 'options.history.dominantSignal'),
              formatDominantSignal(item.dominantSignal)
            )}<br />
            ${formatLine(
              t(currentLanguage, 'options.history.accessMode'),
              item.accessMode === 'full'
                ? t(currentLanguage, 'options.history.fullAccess')
                : t(currentLanguage, 'options.history.limitedAccess')
            )}<br />
            ${formatLine(t(currentLanguage, 'options.history.groupId'), item.groupId ?? t(currentLanguage, 'common.none'))}
          </div>
          <div class="history-meta">${formatLine(t(currentLanguage, 'options.history.reason'), escapeHtml(item.reason || t(currentLanguage, 'options.history.noReason')))}</div>
          <div class="history-meta">${formatLine(t(currentLanguage, 'options.history.evidence'), evidence.length > 0 ? escapeHtml(evidence.join(' | ')) : t(currentLanguage, 'options.history.noEvidence'))}</div>
          <div class="history-meta">${formatLine(t(currentLanguage, 'options.history.headings'), headings.length > 0 ? escapeHtml(headings.join(' | ')) : t(currentLanguage, 'options.history.noHeadings'))}</div>
          <div class="history-meta">${formatLine(t(currentLanguage, 'options.history.content'), escapeHtml(item.contentExcerpt || t(currentLanguage, 'options.history.noContent')))}</div>
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
    setStatus(prettyJson(saved));
  } catch (error) {
    setStatus(serializeError(error));
  } finally {
    ui.saveButton.disabled = false;
  }
}

async function handleProviderTest(): Promise<void> {
  setStatus(t(currentLanguage, 'options.testingProvider'));
  try {
    const settings = await saveSettings(readSettingsFromForm());
    if (settings.providerType === 'chrome-built-in') {
      const availability = await getChromeBuiltInAvailability(settings.chromeBuiltIn);
      const warmupMessage =
        availability === 'available'
          ? t(currentLanguage, 'options.modelReady')
          : await warmupChromeBuiltInModel(settings.chromeBuiltIn);
      const message = `availability=${availability}\n${warmupMessage}`;
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
      throw new Error(response.error ?? t(currentLanguage, 'options.providerTestFailed'));
    }

    setStatus(response.result ?? t(currentLanguage, 'options.providerTestFinished'));
  } catch (error) {
    setStatus(serializeError(error));
  }
}

async function handleRunNow(): Promise<void> {
  setStatus('...');
  try {
    const summary = (await chrome.runtime.sendMessage({
      type: 'manual-scan-current-window'
    })) as ScanSummary;

    setStatus(
      [
        `${t(currentLanguage, 'popup.scanCount')}：${summary.scanned}`,
        `${t(currentLanguage, 'popup.taggedCount')}：${summary.tagged}`,
        `${t(currentLanguage, 'popup.skippedCount')}：${summary.skipped}`,
        `${t(currentLanguage, 'popup.errorCount')}：${summary.errors}`,
        '',
        ...summary.details
      ].join('\n')
    );
    await refreshHistory();
  } catch (error) {
    setStatus(serializeError(error));
  }
}

async function handleClearHistory(): Promise<void> {
  await clearClassificationCache();
  await refreshHistory();
  setStatus(t(currentLanguage, 'options.history.empty'));
}

ui.providerSelect.addEventListener('change', () => {
  toggleProviderPanels(
    ui.providerSelect.value === 'chrome-built-in' ? 'chrome-built-in' : 'openai-compatible'
  );
});

ui.languageSelect.addEventListener('change', () => {
  currentLanguage = resolveUiLanguage(resolveLanguageSetting(ui.languageSelect.value), chrome.i18n.getUILanguage());
  applyTranslations();
  const categories = sanitizeCategories(ui.categoriesInput.value.split('\n'));
  const currentRules = readCategoryRulesFromForm(categories);
  renderCategoryRules(categories, currentRules);
  void refreshHistory();
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
  setStatus('');
})();
