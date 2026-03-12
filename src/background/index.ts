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
  requireUnfocused: boolean
): Promise<boolean> {
  if (!settings.enabled || settings.categories.length === 0) {
    return false;
  }
  if (!tab.id || tab.windowId === undefined || !isClassifiableUrl(tab.url)) {
    return false;
  }
  if (tab.status !== 'complete') {
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

async function collectPageSignals(tab: chrome.tabs.Tab, settings: AppSettings): Promise<PageSignals> {
  if (!tab.id || !tab.url) {
    throw new Error('标签页缺少可用的 id 或 url。');
  }

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
    url: tab.url,
    domain: extractDomain(tab.url),
    title: extracted?.title?.trim() || tab.title || '',
    description: extracted?.description?.trim() || '',
    headings: Array.isArray(extracted?.headings) ? extracted.headings : [],
    contentExcerpt: extracted?.contentExcerpt?.trim() || '',
    language: extracted?.language ?? null
  };
}

async function processTabForClassification(
  tab: chrome.tabs.Tab,
  settings: AppSettings,
  reason: string,
  options?: {
    requireUnfocused?: boolean;
  }
): Promise<ProcessTabResult> {
  if (!tab.id || tab.windowId === undefined || !tab.url) {
    return { status: 'skipped', detail: '标签页缺少必要字段。' };
  }

  if (processingTabs.has(tab.id)) {
    return { status: 'skipped', detail: '该标签页正在处理中。' };
  }

  const requireUnfocused = options?.requireUnfocused ?? true;
  if (!(await isTabEligibleForReason(tab, settings, requireUnfocused))) {
    return { status: 'skipped', detail: '不满足当前扫描条件。' };
  }

  const signature = buildPageSignature(tab.url);
  const existingCache = await loadClassificationCache();
  if (existingCache[signature]) {
    return { status: 'skipped', detail: '该页面已经打过标，已跳过。' };
  }

  const accessProbe = await probeTabAccess(tab);
  if (!accessProbe.ok) {
    await appendActivityLog('info', '跳过不可注入页面', {
      tabId: tab.id,
      reason,
      url: tab.url,
      detail: accessProbe.detail
    });
    return { status: 'skipped', detail: accessProbe.detail };
  }

  processingTabs.add(tab.id);

  try {
    const pageSignals = await collectPageSignals(tab, settings);
    const payload = buildClassificationPayload(settings, pageSignals);
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
      signature,
      category: decision.category,
      taggedAt: new Date().toISOString(),
      providerType: settings.providerType,
      confidence: decision.confidence,
      title: pageSignals.title,
      url: pageSignals.url,
      groupId
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
  return scanTabs(tabs, reason, { requireUnfocused: false });
}

async function testOpenAiProvider(): Promise<string> {
  const settings = await loadSettings();
  if (settings.providerType !== 'openai-compatible') {
    throw new Error('当前 Provider 不是 OpenAI 兼容接口。');
  }

  const tabs = await chrome.tabs.query({ lastFocusedWindow: true });
  const orderedTabs = [
    ...tabs.filter((tab) => tab.active),
    ...tabs.filter((tab) => !tab.active)
  ].filter((tab, index, list) => list.findIndex((candidate) => candidate.id === tab.id) === index);
  const skippedReasons: string[] = [];
  let targetTab: chrome.tabs.Tab | undefined;

  for (const tab of orderedTabs) {
    if (!isClassifiableUrl(tab.url)) {
      skippedReasons.push(`tab ${tab.id ?? 'unknown'}: 非 http/https 页面 ${tab.url ?? '(无 URL)'}`);
      continue;
    }

    const probe = await probeTabAccess(tab);
    if (probe.ok) {
      targetTab = tab;
      break;
    }

    skippedReasons.push(`tab ${tab.id ?? 'unknown'}: ${probe.detail ?? '不可注入页面'}`);
  }

  if (!targetTab || !targetTab.id || !targetTab.url) {
    throw new Error(
      [
        '当前窗口没有可测试的网页标签页。请切到一个普通 http/https 页面后再测试。',
        skippedReasons.length > 0 ? `候选页面跳过原因：${skippedReasons.join(' | ')}` : null
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  const pageSignals = await collectPageSignals(targetTab, settings);
  const decision = await classifyWithOpenAiCompatible(
    buildClassificationPayload(settings, pageSignals),
    settings.openAiCompatible
  );

  const message = `测试成功：${decision.shouldTag ? `建议分类为 ${decision.category}` : '当前页面不建议打标'}。`;
  await appendActivityLog('info', 'Provider 测试成功', {
    providerType: 'openai-compatible',
    url: pageSignals.url,
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
  if (areaName === 'local' && changes[STORAGE_KEYS.settings]) {
    void syncAlarmWithSettings();
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
    !['manual-scan-current-window', 'get-popup-summary', 'test-openai-provider'].includes(
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
