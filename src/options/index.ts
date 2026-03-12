import { getChromeBuiltInAvailability, warmupChromeBuiltInModel } from '../shared/chrome-built-in-provider.js';
import { loadSettings, saveProviderHealth, saveSettings } from '../shared/storage.js';
import type { AppSettings, ScanSummary } from '../shared/types.js';
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
  runNowButton: assertElement(runNowButton, 'run-now-button')
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
  return {
    enabled: ui.enabledInput.checked,
    categories: sanitizeCategories(ui.categoriesInput.value.split('\n')),
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
  } catch (error) {
    setStatus(`扫描失败：${serializeError(error)}`);
  }
}

ui.providerSelect.addEventListener('change', () => {
  toggleProviderPanels(
    ui.providerSelect.value === 'chrome-built-in' ? 'chrome-built-in' : 'openai-compatible'
  );
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

void (async () => {
  const settings = await loadSettings();
  writeSettingsToForm(settings);
  setStatus('设置已加载。');
})();
