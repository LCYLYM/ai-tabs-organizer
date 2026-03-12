import type {
  ActivityLogEntry,
  AppSettings,
  CategoryRule,
  ClassificationDecision,
  TabGroupColor
} from './types.js';

const GROUP_COLORS: TabGroupColor[] = [
  'blue',
  'cyan',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'yellow',
  'grey'
];

export function sanitizeCategories(categories: string[]): string[] {
  const unique = new Set<string>();
  for (const category of categories) {
    const normalized = category.trim();
    if (normalized) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

export function sanitizeSettings(raw: Partial<AppSettings>): AppSettings {
  const categories = sanitizeCategories(raw.categories ?? []);
  return {
    enabled: raw.enabled ?? true,
    categories,
    categoryRules: sanitizeCategoryRules(raw.categoryRules ?? {}, categories),
    promptSupplement: (raw.promptSupplement ?? '').trim(),
    providerType: raw.providerType === 'chrome-built-in' ? 'chrome-built-in' : 'openai-compatible',
    openAiCompatible: {
      baseUrl: normalizeBaseUrl(raw.openAiCompatible?.baseUrl ?? 'https://api.openai.com/v1'),
      apiKey: (raw.openAiCompatible?.apiKey ?? '').trim(),
      model: (raw.openAiCompatible?.model ?? '').trim()
    },
    chromeBuiltIn: {
      temperature: clampNumber(raw.chromeBuiltIn?.temperature ?? 0.2, 0, 2, 0.2),
      topK: Math.round(clampNumber(raw.chromeBuiltIn?.topK ?? 3, 1, 128, 3))
    },
    contentCharacterLimit: Math.round(
      clampNumber(raw.contentCharacterLimit ?? 2400, 500, 12000, 2400)
    ),
    alarmPeriodMinutes: Math.round(clampNumber(raw.alarmPeriodMinutes ?? 5, 1, 60, 5))
  };
}

export function sanitizeCategoryRules(
  rawRules: Record<string, Partial<CategoryRule>>,
  categories: string[]
): Record<string, CategoryRule> {
  const sanitized: Record<string, CategoryRule> = {};
  for (const category of categories) {
    const rawRule = rawRules[category] ?? {};
    sanitized[category] = {
      color: isTabGroupColor(rawRule.color) ? rawRule.color : 'auto',
      collapsed: Boolean(rawRule.collapsed)
    };
  }
  return sanitized;
}

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return 'https://api.openai.com/v1';
  }

  try {
    const url = new URL(trimmed);
    url.hash = '';
    if (url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export function buildChatCompletionsEndpoint(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }

  return normalized.endsWith('/v1')
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

export function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isHttpUrl(url: string | undefined): boolean {
  return Boolean(url && /^https?:\/\//i.test(url));
}

export function isClassifiableUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  return /^https?:\/\//i.test(url);
}

export function computeStableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function buildPageSignature(url: string): string {
  return computeStableHash(url.trim());
}

export function limitText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return normalized.slice(0, limit);
}

export function pickGroupColor(category: string): TabGroupColor {
  const hash = Number.parseInt(computeStableHash(category), 16);
  return GROUP_COLORS[hash % GROUP_COLORS.length] ?? 'grey';
}

export function resolveCategoryColor(category: string, rule: CategoryRule | undefined): TabGroupColor {
  if (rule?.color && rule.color !== 'auto') {
    return rule.color;
  }
  return pickGroupColor(category);
}

export function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === 'string') {
    return error;
  }
  return JSON.stringify(error);
}

export function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}

export function clampConfidence(value: unknown): number {
  const asNumber = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
  if (!Number.isFinite(asNumber)) {
    return 0;
  }
  return Math.min(Math.max(asNumber, 0), 1);
}

export function parseConfidence(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }

  const asNumber = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(asNumber)) {
    return null;
  }

  return Math.min(Math.max(asNumber, 0), 1);
}

export function trimLogDetail(detail: unknown): string | undefined {
  if (detail == null) {
    return undefined;
  }
  const serialized = typeof detail === 'string' ? detail : prettyJson(detail);
  return serialized.length > 1200 ? `${serialized.slice(0, 1197)}...` : serialized;
}

export function buildLogEntry(
  level: ActivityLogEntry['level'],
  message: string,
  detail?: unknown
): ActivityLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    detail: trimLogDetail(detail)
  };
}

function isTabGroupColor(value: unknown): value is TabGroupColor {
  return (
    value === 'grey' ||
    value === 'blue' ||
    value === 'cyan' ||
    value === 'green' ||
    value === 'orange' ||
    value === 'pink' ||
    value === 'purple' ||
    value === 'red' ||
    value === 'yellow'
  );
}

export function assertValidDecision(
  decision: Partial<ClassificationDecision>,
  categories: string[]
): ClassificationDecision {
  const allowedSignals = new Set<ClassificationDecision['dominantSignal']>([
    'title',
    'domain',
    'content',
    'mixed',
    'insufficient'
  ]);

  const category =
    typeof decision.category === 'string' && categories.includes(decision.category)
      ? decision.category
      : null;
  const shouldTag =
    typeof decision.shouldTag === 'boolean' ? decision.shouldTag : Boolean(category);
  const dominantSignal =
    typeof decision.dominantSignal === 'string' && allowedSignals.has(decision.dominantSignal)
      ? decision.dominantSignal
      : 'insufficient';
  const reason =
    typeof decision.reason === 'string' && decision.reason.trim()
      ? decision.reason.trim()
      : category
        ? '模型返回了分类结果，但未提供完整理由。'
        : '模型未提供理由。';

  return {
    shouldTag: shouldTag && Boolean(category),
    category: shouldTag ? category : null,
    confidence: parseConfidence(decision.confidence),
    reason,
    dominantSignal,
    evidence: Array.isArray(decision.evidence)
      ? decision.evidence
          .filter((entry): entry is string => typeof entry === 'string')
          .map((entry) => entry.trim())
          .filter(Boolean)
          .slice(0, 5)
      : []
  };
}
