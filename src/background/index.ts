import { classifyWithOpenAiCompatible } from './openai-compatible-provider.js';
import { AUTOMATION_ALARM_NAME, STORAGE_KEYS } from '../shared/constants.js';
import {
  appendActivityLog,
  ensureTrustedStorageAccess,
  loadActivityLogs,
  loadClassificationCache,
  loadProviderHealth,
  loadSettings,
  saveProviderHealth,
  upsertClassificationRecord
} from '../shared/storage.js';
import type {
  AppSettings,
  ClassificationDecision,
  ClassificationRequestPayload,
  OffscreenClassificationResponse,
  PageSignals,
  PopupSummary,
  ProviderType,
  RuntimeRequest,
  ScanSummary
} from '../shared/types.js';
import {
  buildPageSignature,
  extractDomain,
  isClassifiableUrl,
  resolveCategoryColor,
  serializeError
} from '../shared/utils.js';

const processingTabs = new Set<number>();
const activeTabByWindow = new Map<number, number>();

interface TabAccessProbeResult {
  ok: boolean;
  detail?: string;
}

interface ProcessTabResult {
  status: 'tagged' | 'skipped';
  detail?: string;
}

interface CollectedPageSignalsResult {
  pageSignals: PageSignals;
  accessMode: 'full' | 'limited';
  detail?: string;
}

async function bootstrap(): Promise<void> {
  await ensureTrustedStorageAccess();
  await syncAlarmWithSettings();
  const activeTabs = await chrome.tabs.query({ active: true });
  for (const tab of activeTabs) {
    if (tab.id && tab.windowId !== undefined) {
      activeTabByWindow.set(tab.windowId, tab.id);
    }
  }
}

async function syncAlarmWithSettings(): Promise<void> {
  const settings = await loadSettings();
  await chrome.alarms.clear(AUTOMATION_ALARM_NAME);

  if (!settings.enabled || settings.categories.length === 0) {
    return;
  }

  await chrome.alarms.create(AUTOMATION_ALARM_NAME, {
    periodInMinutes: settings.alarmPeriodMinutes
  });
}

async function getFocusedWindowId(): Promise<number | null> {
  try {
    const windows = await chrome.windows.getAll({ populate: false });
    const focused = windows.find((windowInfo) => windowInfo.focused);
    return focused?.id ?? null;
  } catch {
    return null;
  }
}

async function isTabEligible(tab: chrome.tabs.Tab, settings: AppSettings): Promise<boolean> {
  return isTabEligibleForReason(tab, settings, true);
}

async function isTabEligibleForReason(
  tab: chrome.tabs.Tab,
  settings: AppSettings,
  requireUnfocused: boolean,
  requireAutoEnabled = true
): Promise<boolean> {
  if ((requireAutoEnabled && !settings.enabled) || settings.categories.length === 0) {
    return false;
  }
  if (!tab.id || tab.windowId === undefined || !isClassifiableUrl(tab.url)) {
    return false;
  }
  if (tab.status !== 'complete') {
    return false;
  }
  if (tab.groupId !== undefined && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
    return false;
  }

  if (!requireUnfocused) {
    return true;
  }

  const focusedWindowId = await getFocusedWindowId();
  const isFocusedTab = focusedWindowId != null && tab.windowId === focusedWindowId && Boolean(tab.active);
  return !isFocusedTab;
}

function buildClassificationPayload(
  settings: AppSettings,
  pageSignals: PageSignals
): ClassificationRequestPayload {
  return {
    categories: settings.categories,
    promptSupplement: settings.promptSupplement,
    pageSignals
  };
}

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL('offscreen/index.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: '在后台自动分类标签页时运行 Chrome 内置 Prompt API。'
  });
}

async function classifyWithChromeBuiltInInOffscreen(
  payload: ClassificationRequestPayload,
  settings: AppSettings
): Promise<ClassificationDecision> {
  await ensureOffscreenDocument();
  const requestId = crypto.randomUUID();
  const response = (await chrome.runtime.sendMessage({
    type: 'offscreen-classify',
    requestId,
    payload,
    config: settings.chromeBuiltIn
  })) as OffscreenClassificationResponse | undefined;

  if (!response || response.requestId !== requestId) {
    throw new Error('未收到离屏文档的分类响应。');
  }

  if (!response.ok || !response.decision) {
    throw new Error(response.error ?? '离屏文档分类失败。');
  }

  return response.decision;
}

async function classifyPage(
  payload: ClassificationRequestPayload,
  settings: AppSettings
): Promise<ClassificationDecision> {
  return settings.providerType === 'chrome-built-in'
    ? classifyWithChromeBuiltInInOffscreen(payload, settings)
    : classifyWithOpenAiCompatible(payload, settings.openAiCompatible);
}

async function probeTabAccess(tab: chrome.tabs.Tab): Promise<TabAccessProbeResult> {
  if (!tab.id || !tab.url) {
    return { ok: false, detail: '标签页缺少 id 或 url。' };
  }

  if (!isClassifiableUrl(tab.url)) {
    return { ok: false, detail: `不支持的页面协议：${tab.url}` };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.location.href
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      detail: `不可读取页面内容：${serializeError(error)}`
    };
  }
}

async function getOrCreateCategoryGroup(
  windowId: number,
  tabId: number,
  category: string,
  settings: AppSettings
): Promise<number> {
  const categoryRule = settings.categoryRules[category];
  const existingGroups = await chrome.tabGroups.query({ windowId });
  const matchingGroup = existingGroups.find((group) => group.title === category);

  if (matchingGroup) {
    const groupId = await chrome.tabs.group({ groupId: matchingGroup.id, tabIds: [tabId] });
    await chrome.tabGroups.update(groupId, {
      title: category,
      color: resolveCategoryColor(category, categoryRule),
      collapsed: categoryRule?.collapsed ?? false
    });
    return groupId;
  }

  const groupId = await chrome.tabs.group({
    tabIds: [tabId],
    createProperties: { windowId }
  });

  await chrome.tabGroups.update(groupId, {
    title: category,
    color: resolveCategoryColor(category, categoryRule),
    collapsed: categoryRule?.collapsed ?? false
  });

  return groupId;
}

async function collectPageSignals(
  tab: chrome.tabs.Tab,
  settings: AppSettings
): Promise<CollectedPageSignalsResult> {
  if (!tab.id || !tab.url) {
    throw new Error('标签页缺少可用的 id 或 url。');
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (contentLimit: number) => {
        const normalize = (value: string | null | undefined): string =>
          (value ?? '').replace(/\s+/g, ' ').trim();

        const limitText = (value: string, limit: number): string =>
          value.length <= limit ? value : value.slice(0, limit);

        const readMeta = (selector: string): string => {
          const element = document.querySelector<HTMLMetaElement>(selector);
          return normalize(element?.content);
        };

        const collectText = (root: ParentNode, limit: number): string => {
          const textParts: string[] = [];
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
              const parentElement = node.parentElement;
              if (!parentElement) {
                return NodeFilter.FILTER_REJECT;
              }
              const tagName = parentElement.tagName;
              if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG'].includes(tagName)) {
                return NodeFilter.FILTER_REJECT;
              }
              return normalize(node.textContent).length > 0
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
            }
          });

          while (walker.nextNode()) {
            const currentText = normalize(walker.currentNode.textContent);
            if (!currentText) {
              continue;
            }
            textParts.push(currentText);
            if (textParts.join(' ').length >= limit) {
              break;
            }
          }

          return limitText(textParts.join(' '), limit);
        };

        const mainRoot =
          document.querySelector('main, article, [role="main"], [data-testid="article"]') ??
          document.body;

        return {
          title: normalize(document.title),
          description:
            readMeta('meta[name="description"]') || readMeta('meta[property="og:description"]'),
          headings: Array.from(document.querySelectorAll('h1, h2, h3'))
            .map((heading) => normalize(heading.textContent))
            .filter(Boolean)
            .slice(0, 12),
          contentExcerpt: collectText(mainRoot, contentLimit),
          language: normalize(document.documentElement.lang) || null
        };
      },
      args: [settings.contentCharacterLimit]
    });

    const extracted = results[0]?.result as
      | {
          title?: string;
          description?: string;
          headings?: string[];
          contentExcerpt?: string;
          language?: string | null;
        }
      | undefined;

    return {
      accessMode: 'full',
      pageSignals: {
        url: tab.url,
        domain: extractDomain(tab.url),
        title: extracted?.title?.trim() || tab.title || '',
        description: extracted?.description?.trim() || '',
        headings: Array.isArray(extracted?.headings) ? extracted.headings : [],
        contentExcerpt: extracted?.contentExcerpt?.trim() || '',
        language: extracted?.language ?? null
      }
    };
  } catch (error) {
    return {
      accessMode: 'limited',
      detail: `正文读取失败，已退回标题和域名：${serializeError(error)}`,
      pageSignals: {
        url: tab.url,
        domain: extractDomain(tab.url),
        title: (tab.title ?? '').trim(),
        description: '',
        headings: [],
        contentExcerpt: '',
        language: null
      }
    };
  }
}

async function processTabForClassification(
  tab: chrome.tabs.Tab,
  settings: AppSettings,
  reason: string,
  options?: {
    requireUnfocused?: boolean;
    requireAutoEnabled?: boolean;
  }
): Promise<ProcessTabResult> {
  if (!tab.id || tab.windowId === undefined || !tab.url) {
    return { status: 'skipped', detail: '标签页缺少必要字段。' };
  }

  if (processingTabs.has(tab.id)) {
    return { status: 'skipped', detail: '该标签页正在处理中。' };
  }

  const requireUnfocused = options?.requireUnfocused ?? true;
  const requireAutoEnabled = options?.requireAutoEnabled ?? true;
  if (!(await isTabEligibleForReason(tab, settings, requireUnfocused, requireAutoEnabled))) {
    const alreadyGrouped =
      tab.groupId !== undefined && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE;
    return {
      status: 'skipped',
      detail: alreadyGrouped ? '该标签页当前已经在分组中，已跳过。' : '不满足当前扫描条件。'
    };
  }

  processingTabs.add(tab.id);

  try {
    const collectedSignals = await collectPageSignals(tab, settings);
    if (collectedSignals.accessMode === 'limited') {
      await appendActivityLog('info', '页面正文不可读取，退回标题和域名分类', {
        tabId: tab.id,
        reason,
        url: tab.url,
        detail: collectedSignals.detail
      });
    }

    const payload = buildClassificationPayload(settings, collectedSignals.pageSignals);
    const decision = await classifyPage(payload, settings);

    if (!decision.shouldTag || !decision.category) {
      await appendActivityLog('info', '分类完成但未执行打标', {
        tabId: tab.id,
        reason,
        url: tab.url,
        decision
      });
      return { status: 'skipped', detail: `模型判定为不应打标：${decision.reason}` };
    }

    const groupId = await getOrCreateCategoryGroup(tab.windowId, tab.id, decision.category, settings);
    await upsertClassificationRecord({
      signature: buildPageSignature(collectedSignals.pageSignals.url),
      category: decision.category,
      taggedAt: new Date().toISOString(),
      providerType: settings.providerType,
      confidence: decision.confidence,
      title: collectedSignals.pageSignals.title,
      url: collectedSignals.pageSignals.url,
      groupId,
      domain: collectedSignals.pageSignals.domain,
      description: collectedSignals.pageSignals.description,
      headings: collectedSignals.pageSignals.headings,
      contentExcerpt: collectedSignals.pageSignals.contentExcerpt,
      dominantSignal: decision.dominantSignal,
      reason: decision.reason,
      evidence: decision.evidence,
      accessMode: collectedSignals.accessMode,
      accessDetail: collectedSignals.detail
    });

    await appendActivityLog('info', '标签页已自动打标', {
      tabId: tab.id,
      reason,
      category: decision.category,
      confidence: decision.confidence,
      dominantSignal: decision.dominantSignal,
      url: tab.url
    });

    return { status: 'tagged', detail: `已归类为 ${decision.category}` };
  } finally {
    processingTabs.delete(tab.id);
  }
}

async function scanTabs(
  tabs: chrome.tabs.Tab[],
  reason: string,
  options?: {
    requireUnfocused?: boolean;
    requireAutoEnabled?: boolean;
  }
): Promise<ScanSummary> {
  const settings = await loadSettings();
  const summary: ScanSummary = {
    scanned: 0,
    tagged: 0,
    skipped: 0,
    errors: 0,
    details: []
  };

  for (const tab of tabs) {
    if (!tab.id) {
      continue;
    }

      summary.scanned += 1;
    try {
      const outcome = await processTabForClassification(tab, settings, reason, options);
      if (outcome.status === 'tagged') {
        summary.tagged += 1;
        summary.details.push(`tab ${tab.id}: ${outcome.detail ?? '已分组'}`);
      } else {
        summary.skipped += 1;
        if (outcome.detail) {
          summary.details.push(`tab ${tab.id}: ${outcome.detail}`);
        }
      }
    } catch (error) {
      summary.errors += 1;
      const message = serializeError(error);
      summary.details.push(`tab ${tab.id}: ${message}`);
      await appendActivityLog('error', '标签页自动分类失败', {
        tabId: tab.id,
        reason,
        error: message,
        url: tab.url
      });
    }
  }

  return summary;
}

async function scanCurrentWindow(reason: string): Promise<ScanSummary> {
  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  return scanTabs(tabs, reason, { requireUnfocused: false, requireAutoEnabled: false });
}

async function kickoffAutoScan(): Promise<ScanSummary> {
  const tabs = await chrome.tabs.query({});
  return scanTabs(tabs, 'auto-enabled-kickoff', {
    requireUnfocused: true,
    requireAutoEnabled: true
  });
}

async function testOpenAiProvider(): Promise<string> {
  const settings = await loadSettings();
  if (settings.providerType !== 'openai-compatible') {
    throw new Error('当前 Provider 不是 OpenAI 兼容接口。');
  }

  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const targetTab = [...tabs]
    .filter((tab) => isClassifiableUrl(tab.url))
    .sort((left, right) => (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0))[0];

  if (!targetTab || !targetTab.id || !targetTab.url) {
    throw new Error('当前窗口没有可测试的 http/https 网页标签页。');
  }

  const collectedSignals = await collectPageSignals(targetTab, settings);
  const decision = await classifyWithOpenAiCompatible(
    buildClassificationPayload(settings, collectedSignals.pageSignals),
    settings.openAiCompatible
  );

  const message = `测试成功：${decision.shouldTag ? `建议分类为 ${decision.category}` : '当前页面不建议打标'}。`;
  await appendActivityLog('info', 'Provider 测试成功', {
    providerType: 'openai-compatible',
    url: collectedSignals.pageSignals.url,
    accessMode: collectedSignals.accessMode,
    accessDetail: collectedSignals.detail,
    title: collectedSignals.pageSignals.title,
    domain: collectedSignals.pageSignals.domain,
    contentExcerpt: collectedSignals.pageSignals.contentExcerpt,
    category: decision.category,
    dominantSignal: decision.dominantSignal,
    confidence: decision.confidence,
    reason: decision.reason
  });
  await saveProviderHealth({
    checkedAt: new Date().toISOString(),
    providerType: 'openai-compatible',
    ok: true,
    message
  });
  return `${message}\n主导信号：${decision.dominantSignal}\n理由：${decision.reason}`;
}

async function buildPopupSummary(): Promise<PopupSummary> {
  const [settings, cache, logs, providerHealth, currentTabs] = await Promise.all([
    loadSettings(),
    loadClassificationCache(),
    loadActivityLogs(),
    loadProviderHealth(),
    chrome.tabs.query({ lastFocusedWindow: true })
  ]);

  return {
    enabled: settings.enabled,
    providerType: settings.providerType,
    categoryCount: settings.categories.length,
    currentWindowTabCount: currentTabs.length,
    cachedTaggedCount: Object.keys(cache).length,
    latestLog: logs[0],
    latestProviderStatus: providerHealth
  };
}

chrome.runtime.onInstalled.addListener((_details) => {
  void bootstrap();
});

chrome.runtime.onStartup.addListener(() => {
  void bootstrap();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  const settingsChange = changes[STORAGE_KEYS.settings];
  if (areaName === 'local' && settingsChange) {
    void syncAlarmWithSettings();
    const oldSettings = settingsChange.oldValue as AppSettings | undefined;
    const newSettings = settingsChange.newValue as AppSettings | undefined;
    if (!oldSettings?.enabled && newSettings?.enabled) {
      void kickoffAutoScan();
    }
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTOMATION_ALARM_NAME) {
    return;
  }

  void (async () => {
    const tabs = await chrome.tabs.query({});
    await scanTabs(tabs, 'periodic-alarm');
  })();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  const previousTabId = activeTabByWindow.get(activeInfo.windowId);
  activeTabByWindow.set(activeInfo.windowId, activeInfo.tabId);

  void (async () => {
    if (!previousTabId) {
      return;
    }

    const previousTab = await chrome.tabs.get(previousTabId);
    const settings = await loadSettings();
    await processTabForClassification(previousTab, settings, 'tab-deactivated');
  })();
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    return;
  }

  void (async () => {
    const tabs = await chrome.tabs.query({ active: true });
    await scanTabs(tabs, 'window-blurred');
  })();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!('status' in changeInfo) && !('url' in changeInfo) && !('title' in changeInfo)) {
    return;
  }

  void (async () => {
    if (!tab.url || !isClassifiableUrl(tab.url)) {
      return;
    }

    if (changeInfo.status === 'complete' && !tab.active) {
      const settings = await loadSettings();
      await processTabForClassification(await chrome.tabs.get(tabId), settings, 'tab-updated');
    }
  })();
});

chrome.runtime.onMessage.addListener((message: RuntimeRequest, _sender, sendResponse) => {
  if (
    !message ||
    typeof message !== 'object' ||
    !['manual-scan-current-window', 'get-popup-summary', 'test-openai-provider', 'kickoff-auto-scan'].includes(
      (message as { type?: string }).type ?? ''
    )
  ) {
    return undefined;
  }

  void (async () => {
    try {
      switch (message.type) {
        case 'manual-scan-current-window': {
          const summary = await scanCurrentWindow('manual-scan');
          sendResponse(summary);
          return;
        }
        case 'get-popup-summary': {
          const summary = await buildPopupSummary();
          sendResponse(summary);
          return;
        }
        case 'test-openai-provider': {
          const result = await testOpenAiProvider();
          sendResponse({ ok: true, result });
          return;
        }
        case 'kickoff-auto-scan': {
          const summary = await kickoffAutoScan();
          sendResponse(summary);
          return;
        }
      }
    } catch (error) {
      const messageText = serializeError(error);
      await appendActivityLog('error', '运行时请求失败', {
        requestType: message.type,
        error: messageText
      });
      await saveProviderHealth({
        checkedAt: new Date().toISOString(),
        providerType: (await loadSettings()).providerType as ProviderType,
        ok: false,
        message: messageText
      });
      sendResponse({ ok: false, error: messageText });
    }
  })();

  return true;
});

void bootstrap();
