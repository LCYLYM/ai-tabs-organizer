import type { UiLanguage } from './types.js';

type TranslationKey =
  | 'popup.title'
  | 'popup.autoTagging'
  | 'popup.scanCurrentWindow'
  | 'popup.rebuildCurrentWindow'
  | 'popup.clearCurrentWindow'
  | 'popup.clearAll'
  | 'popup.openSettings'
  | 'popup.loading'
  | 'popup.waiting'
  | 'popup.autoEnabled'
  | 'popup.autoDisabled'
  | 'popup.providerStatus.success'
  | 'popup.providerStatus.failure'
  | 'popup.provider.openai'
  | 'popup.provider.chrome'
  | 'popup.summary.enabled'
  | 'popup.summary.provider'
  | 'popup.summary.categoryCount'
  | 'popup.summary.windowTabCount'
  | 'popup.summary.cachedTaggedCount'
  | 'popup.latestProviderStatus'
  | 'popup.latestLog'
  | 'popup.logDetail'
  | 'popup.none'
  | 'popup.scanning'
  | 'popup.rebuilding'
  | 'popup.clearingCurrent'
  | 'popup.clearingAll'
  | 'popup.rebuildDone'
  | 'popup.clearCurrentDone'
  | 'popup.clearAllDone'
  | 'popup.autoToggleStarted'
  | 'popup.scanCount'
  | 'popup.taggedCount'
  | 'popup.skippedCount'
  | 'popup.errorCount'
  | 'popup.ungroupedTabs'
  | 'popup.clearedRecords'
  | 'popup.touchedWindows'
  | 'popup.clearFailed'
  | 'popup.autoDisabledMessage'
  | 'popup.scanFailed'
  | 'popup.rebuildFailed'
  | 'popup.autoToggleFailed'
  | 'options.title'
  | 'options.eyebrow'
  | 'options.intro'
  | 'options.save'
  | 'options.categories'
  | 'options.categoryNames'
  | 'options.categoryPlaceholder'
  | 'options.promptSupplement'
  | 'options.promptPlaceholder'
  | 'options.provider'
  | 'options.providerLabel'
  | 'options.provider.openai'
  | 'options.provider.chrome'
  | 'options.baseUrl'
  | 'options.apiKey'
  | 'options.apiKeyPlaceholder'
  | 'options.model'
  | 'options.modelPlaceholder'
  | 'options.temperature'
  | 'options.topK'
  | 'options.chromeHint'
  | 'options.strategy'
  | 'options.enableAuto'
  | 'options.contentLimit'
  | 'options.alarmMinutes'
  | 'options.language'
  | 'options.language.auto'
  | 'options.language.zh-CN'
  | 'options.language.en'
  | 'options.diagnostics'
  | 'options.languageSection'
  | 'options.languageHint'
  | 'options.testProvider'
  | 'options.testingProvider'
  | 'options.modelReady'
  | 'options.providerTestFinished'
  | 'options.providerTestFailed'
  | 'options.runNow'
  | 'options.rules'
  | 'options.rulesHint'
  | 'options.history'
  | 'options.refreshHistory'
  | 'options.clearHistory'
  | 'options.ruleColor'
  | 'options.ruleAutoColor'
  | 'options.ruleCollapsed'
  | 'options.history.empty'
  | 'options.history.title'
  | 'options.history.domain'
  | 'options.history.provider'
  | 'options.history.confidence'
  | 'options.history.dominantSignal'
  | 'options.history.accessMode'
  | 'options.history.groupId'
  | 'options.history.reason'
  | 'options.history.evidence'
  | 'options.history.headings'
  | 'options.history.content'
  | 'options.history.noReason'
  | 'options.history.noEvidence'
  | 'options.history.noHeadings'
  | 'options.history.noContent'
  | 'options.history.fullAccess'
  | 'options.history.limitedAccess'
  | 'common.unknownDomain'
  | 'common.noTitle'
  | 'common.none'
  | 'common.notProvided'
  | 'signal.title'
  | 'signal.domain'
  | 'signal.content'
  | 'signal.mixed'
  | 'signal.insufficient';

type TranslationMap = Record<TranslationKey, string>;

const zhCN: TranslationMap = {
  'popup.title': '当前窗口状态',
  'popup.autoTagging': '自动打标',
  'popup.scanCurrentWindow': '一键打标当前窗口',
  'popup.rebuildCurrentWindow': '重建当前窗口分组',
  'popup.clearCurrentWindow': '清除当前窗口分组/记录',
  'popup.clearAll': '清除所有分组/记录',
  'popup.openSettings': '打开设置',
  'popup.loading': '正在加载...',
  'popup.waiting': '等待操作。',
  'popup.autoEnabled': '已启用',
  'popup.autoDisabled': '已关闭',
  'popup.providerStatus.success': '成功',
  'popup.providerStatus.failure': '失败',
  'popup.provider.openai': 'OpenAI 兼容接口',
  'popup.provider.chrome': 'Chrome 内置 AI',
  'popup.summary.enabled': '自动打标',
  'popup.summary.provider': 'Provider',
  'popup.summary.categoryCount': '分类数',
  'popup.summary.windowTabCount': '当前窗口标签页',
  'popup.summary.cachedTaggedCount': '累计已打标页面',
  'popup.latestProviderStatus': '最近 Provider 状态',
  'popup.latestLog': '最近日志',
  'popup.logDetail': '日志详情',
  'popup.none': '暂无',
  'popup.scanning': '正在扫描当前窗口...',
  'popup.rebuilding': '正在重建当前窗口分组...',
  'popup.clearingCurrent': '正在清除当前窗口分组和打标记录...',
  'popup.clearingAll': '正在清除所有标签页分组和打标记录...',
  'popup.rebuildDone': '当前窗口分组已重建。',
  'popup.clearCurrentDone': '当前窗口分组和打标记录已清除。',
  'popup.clearAllDone': '所有标签页分组和打标记录已清除。',
  'popup.autoToggleStarted': '自动打标已开启，并已立即执行一次后台扫描。',
  'popup.scanCount': '扫描',
  'popup.taggedCount': '已打标',
  'popup.skippedCount': '跳过',
  'popup.errorCount': '错误',
  'popup.ungroupedTabs': '解除分组标签页',
  'popup.clearedRecords': '清除打标记录',
  'popup.touchedWindows': '涉及窗口',
  'popup.clearFailed': '清除失败',
  'popup.autoDisabledMessage': '自动打标已关闭。',
  'popup.scanFailed': '扫描失败',
  'popup.rebuildFailed': '重建失败',
  'popup.autoToggleFailed': '切换自动打标失败',
  'options.title': '中文标签页自动分类设置',
  'options.eyebrow': 'AI Tabs Organizer',
  'options.intro': '配置分类目标、AI Provider 和自动打标策略。扩展只会在标签页未获得焦点且当前页面尚未被打标时触发分类。',
  'options.save': '保存设置',
  'options.categories': '分类目标',
  'options.categoryNames': '分类名称',
  'options.categoryPlaceholder': '每行一个分类，例如：工作项目\n学习资料\n待办处理',
  'options.promptSupplement': '补充提示词',
  'options.promptPlaceholder': '可选。补充你的分类原则、业务语境、禁忌或优先规则。',
  'options.provider': 'Provider',
  'options.providerLabel': 'AI Provider',
  'options.provider.openai': 'OpenAI 兼容接口',
  'options.provider.chrome': 'AI 语义解析（Chrome 内置 Prompt API）',
  'options.baseUrl': 'Base URL',
  'options.apiKey': 'API Key',
  'options.apiKeyPlaceholder': '粘贴你的 API Key',
  'options.model': 'Model',
  'options.modelPlaceholder': '例如：gpt-4.1-mini',
  'options.temperature': 'Temperature',
  'options.topK': 'Top-K',
  'options.chromeHint': '需要 Chrome 138+ 且本机满足 Gemini Nano 内置模型要求。首次使用可能会下载模型。',
  'options.strategy': '自动策略',
  'options.enableAuto': '启用自动打标',
  'options.contentLimit': '正文采样字符数上限',
  'options.alarmMinutes': '后台扫描周期（分钟）',
  'options.language': '界面语言',
  'options.language.auto': '跟随浏览器',
  'options.language.zh-CN': '简体中文',
  'options.language.en': 'English',
  'options.diagnostics': '连接与诊断',
  'options.languageSection': '界面语言',
  'options.languageHint': '可在这里切换完整中文界面、完整英文界面，或跟随浏览器语言。',
  'options.testProvider': '测试 Provider',
  'options.testingProvider': '正在执行 Provider 测试...',
  'options.modelReady': '模型已就绪。',
  'options.providerTestFinished': 'Provider 测试完成。',
  'options.providerTestFailed': 'Provider 测试失败',
  'options.runNow': '立即扫描当前窗口',
  'options.rules': '分类分组规则',
  'options.rulesHint': '为每个分类指定分组颜色，并设置打标后是否默认折叠。',
  'options.history': '分类结果历史',
  'options.refreshHistory': '刷新历史',
  'options.clearHistory': '清空历史',
  'options.ruleColor': '分组颜色',
  'options.ruleAutoColor': '自动配色',
  'options.ruleCollapsed': '打标后默认折叠',
  'options.history.empty': '暂无历史记录。',
  'options.history.title': '标题',
  'options.history.domain': '域名',
  'options.history.provider': 'Provider',
  'options.history.confidence': '置信度',
  'options.history.dominantSignal': '主导信号',
  'options.history.accessMode': '内容读取',
  'options.history.groupId': '分组 ID',
  'options.history.reason': '判断理由',
  'options.history.evidence': '关键证据',
  'options.history.headings': '标题摘要',
  'options.history.content': '正文摘要',
  'options.history.noReason': '模型未提供理由',
  'options.history.noEvidence': '模型未提供证据',
  'options.history.noHeadings': '未读取到标题层级',
  'options.history.noContent': '未读取到正文内容',
  'options.history.fullAccess': '标题 + 域名 + 正文',
  'options.history.limitedAccess': '标题 + 域名（正文不可读取）',
  'common.unknownDomain': '未知域名',
  'common.noTitle': '无标题',
  'common.none': '无',
  'common.notProvided': '未提供',
  'signal.title': '标题',
  'signal.domain': '域名',
  'signal.content': '正文',
  'signal.mixed': '综合判断',
  'signal.insufficient': '证据不足'
};

const en: TranslationMap = {
  'popup.title': 'Current Window',
  'popup.autoTagging': 'Auto tagging',
  'popup.scanCurrentWindow': 'Tag current window now',
  'popup.rebuildCurrentWindow': 'Rebuild current window groups',
  'popup.clearCurrentWindow': 'Clear current window groups/records',
  'popup.clearAll': 'Clear all groups/records',
  'popup.openSettings': 'Open settings',
  'popup.loading': 'Loading...',
  'popup.waiting': 'Waiting for action.',
  'popup.autoEnabled': 'Enabled',
  'popup.autoDisabled': 'Disabled',
  'popup.providerStatus.success': 'Success',
  'popup.providerStatus.failure': 'Failure',
  'popup.provider.openai': 'OpenAI-compatible API',
  'popup.provider.chrome': 'Chrome built-in AI',
  'popup.summary.enabled': 'Auto tagging',
  'popup.summary.provider': 'Provider',
  'popup.summary.categoryCount': 'Categories',
  'popup.summary.windowTabCount': 'Tabs in current window',
  'popup.summary.cachedTaggedCount': 'Tagged pages recorded',
  'popup.latestProviderStatus': 'Latest provider status',
  'popup.latestLog': 'Latest log',
  'popup.logDetail': 'Log detail',
  'popup.none': 'None',
  'popup.scanning': 'Scanning current window...',
  'popup.rebuilding': 'Rebuilding current window groups...',
  'popup.clearingCurrent': 'Clearing current window groups and tag records...',
  'popup.clearingAll': 'Clearing all tab groups and tag records...',
  'popup.rebuildDone': 'Current window groups have been rebuilt.',
  'popup.clearCurrentDone': 'Current window groups and tag records have been cleared.',
  'popup.clearAllDone': 'All tab groups and tag records have been cleared.',
  'popup.autoToggleStarted': 'Auto tagging is enabled and an immediate background scan has started.',
  'popup.scanCount': 'Scanned',
  'popup.taggedCount': 'Tagged',
  'popup.skippedCount': 'Skipped',
  'popup.errorCount': 'Errors',
  'popup.ungroupedTabs': 'Ungrouped tabs',
  'popup.clearedRecords': 'Cleared records',
  'popup.touchedWindows': 'Touched windows',
  'popup.clearFailed': 'Clear failed',
  'popup.autoDisabledMessage': 'Auto tagging is disabled.',
  'popup.scanFailed': 'Scan failed',
  'popup.rebuildFailed': 'Rebuild failed',
  'popup.autoToggleFailed': 'Failed to toggle auto tagging',
  'options.title': 'AI tab auto-classification settings',
  'options.eyebrow': 'AI Tabs Organizer',
  'options.intro': 'Configure categories, AI provider, and auto-tagging strategy. The extension only runs when a tab is unfocused and has not been tagged yet.',
  'options.save': 'Save settings',
  'options.categories': 'Categories',
  'options.categoryNames': 'Category names',
  'options.categoryPlaceholder': 'One category per line, e.g.\nWork projects\nLearning materials\nTo-do',
  'options.promptSupplement': 'Prompt supplement',
  'options.promptPlaceholder': 'Optional. Add business context, extra rules, or forbidden cases.',
  'options.provider': 'Provider',
  'options.providerLabel': 'AI provider',
  'options.provider.openai': 'OpenAI-compatible API',
  'options.provider.chrome': 'Semantic parsing (Chrome Prompt API)',
  'options.baseUrl': 'Base URL',
  'options.apiKey': 'API Key',
  'options.apiKeyPlaceholder': 'Paste your API key',
  'options.model': 'Model',
  'options.modelPlaceholder': 'e.g. gpt-4.1-mini',
  'options.temperature': 'Temperature',
  'options.topK': 'Top-K',
  'options.chromeHint': 'Requires Chrome 138+ and a device that supports Gemini Nano. The model may be downloaded on first use.',
  'options.strategy': 'Automation',
  'options.enableAuto': 'Enable auto tagging',
  'options.contentLimit': 'Content sampling character limit',
  'options.alarmMinutes': 'Background scan interval (minutes)',
  'options.language': 'Interface language',
  'options.language.auto': 'Follow browser',
  'options.language.zh-CN': '简体中文',
  'options.language.en': 'English',
  'options.diagnostics': 'Connection & diagnostics',
  'options.languageSection': 'Interface language',
  'options.languageHint': 'Switch between full Chinese UI, full English UI, or follow the browser language.',
  'options.testProvider': 'Test provider',
  'options.testingProvider': 'Running provider test...',
  'options.modelReady': 'Model ready.',
  'options.providerTestFinished': 'Provider test finished.',
  'options.providerTestFailed': 'Provider test failed',
  'options.runNow': 'Scan current window now',
  'options.rules': 'Category grouping rules',
  'options.rulesHint': 'Set a group color and default collapsed state for each category.',
  'options.history': 'Classification history',
  'options.refreshHistory': 'Refresh history',
  'options.clearHistory': 'Clear history',
  'options.ruleColor': 'Group color',
  'options.ruleAutoColor': 'Auto color',
  'options.ruleCollapsed': 'Collapse after tagging',
  'options.history.empty': 'No history yet.',
  'options.history.title': 'Title',
  'options.history.domain': 'Domain',
  'options.history.provider': 'Provider',
  'options.history.confidence': 'Confidence',
  'options.history.dominantSignal': 'Dominant signal',
  'options.history.accessMode': 'Content access',
  'options.history.groupId': 'Group ID',
  'options.history.reason': 'Reason',
  'options.history.evidence': 'Evidence',
  'options.history.headings': 'Headings',
  'options.history.content': 'Content excerpt',
  'options.history.noReason': 'Model did not provide a reason',
  'options.history.noEvidence': 'Model did not provide evidence',
  'options.history.noHeadings': 'No headings captured',
  'options.history.noContent': 'No content captured',
  'options.history.fullAccess': 'Title + domain + page content',
  'options.history.limitedAccess': 'Title + domain (content unavailable)',
  'common.unknownDomain': 'Unknown domain',
  'common.noTitle': 'Untitled',
  'common.none': 'None',
  'common.notProvided': 'Not provided',
  'signal.title': 'Title',
  'signal.domain': 'Domain',
  'signal.content': 'Content',
  'signal.mixed': 'Mixed',
  'signal.insufficient': 'Insufficient evidence'
};

export function resolveUiLanguage(setting: UiLanguage, browserLanguage?: string): UiLanguage {
  if (setting === 'zh-CN' || setting === 'en') {
    return setting;
  }

  const candidate = browserLanguage ?? chrome.i18n?.getUILanguage?.() ?? 'en';
  return candidate.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

export function t(language: UiLanguage, key: TranslationKey): string {
  const table = language === 'zh-CN' ? zhCN : en;
  return table[key];
}
