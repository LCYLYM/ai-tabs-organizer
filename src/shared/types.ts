export type ProviderType = 'openai-compatible' | 'chrome-built-in';
export type TabGroupColor = chrome.tabGroups.TabGroup['color'];
export type UiLanguage = 'auto' | 'zh-CN' | 'en';

export interface OpenAiCompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChromeBuiltInConfig {
  temperature: number;
  topK: number;
}

export interface AppSettings {
  enabled: boolean;
  language: UiLanguage;
  categories: string[];
  categoryRules: Record<string, CategoryRule>;
  promptSupplement: string;
  reclassifyOnUrlChange: boolean;
  providerType: ProviderType;
  openAiCompatible: OpenAiCompatibleConfig;
  chromeBuiltIn: ChromeBuiltInConfig;
  contentCharacterLimit: number;
  alarmPeriodMinutes: number;
}

export interface CategoryRule {
  color: TabGroupColor | 'auto';
  collapsed: boolean;
}

export interface PageSignals {
  url: string;
  domain: string;
  title: string;
  description: string;
  headings: string[];
  contentExcerpt: string;
  language: string | null;
}

export type DominantSignal = 'title' | 'domain' | 'content' | 'mixed' | 'insufficient';

export interface ClassificationDecision {
  shouldTag: boolean;
  category: string | null;
  confidence: number | null;
  reason: string;
  dominantSignal: DominantSignal;
  evidence: string[];
}

export interface ClassificationCacheRecord {
  signature: string;
  category: string;
  taggedAt: string;
  providerType: ProviderType;
  confidence: number | null;
  title: string;
  url: string;
  groupId: number | null;
  domain: string;
  description: string;
  headings: string[];
  contentExcerpt: string;
  dominantSignal: DominantSignal;
  reason: string;
  evidence: string[];
  accessMode: 'full' | 'limited';
  accessDetail?: string;
}

export interface TabClassificationStateRecord {
  tabId: number;
  lastClassifiedUrl: string;
  groupId: number | null;
  category: string;
  taggedAt: string;
}

export interface ActivityLogEntry {
  timestamp: string;
  level: 'info' | 'error';
  message: string;
  detail?: string;
}

export interface ProviderHealthStatus {
  checkedAt: string;
  providerType: ProviderType;
  ok: boolean;
  message: string;
}

export interface ScanSummary {
  scanned: number;
  tagged: number;
  skipped: number;
  errors: number;
  details: string[];
}

export interface ClassificationRequestPayload {
  categories: string[];
  promptSupplement: string;
  pageSignals: PageSignals;
}

export interface OffscreenClassificationRequest {
  type: 'offscreen-classify';
  requestId: string;
  payload: ClassificationRequestPayload;
  config: ChromeBuiltInConfig;
}

export interface OffscreenClassificationResponse {
  type: 'offscreen-classify-result';
  requestId: string;
  ok: boolean;
  decision?: ClassificationDecision;
  error?: string;
}

export type RuntimeRequest =
  | { type: 'manual-scan-current-window' }
  | { type: 'rebuild-current-window' }
  | { type: 'clear-current-window-grouping-and-records' }
  | { type: 'clear-all-grouping-and-records' }
  | { type: 'get-popup-summary' }
  | { type: 'test-openai-provider' }
  | { type: 'kickoff-auto-scan' };

export interface PopupSummary {
  enabled: boolean;
  providerType: ProviderType;
  categoryCount: number;
  currentWindowTabCount: number;
  cachedTaggedCount: number;
  latestLog?: ActivityLogEntry;
  latestProviderStatus?: ProviderHealthStatus;
}
