import { DEFAULT_SETTINGS, MAX_ACTIVITY_LOGS, MAX_CACHE_RECORDS, STORAGE_KEYS } from './constants.js';
import type {
  ActivityLogEntry,
  AppSettings,
  ClassificationCacheRecord,
  ProviderHealthStatus,
  TabClassificationStateRecord
} from './types.js';
import { buildLogEntry, sanitizeSettings } from './utils.js';

async function getLocalValue<T>(key: string): Promise<T | undefined> {
  const result = await chrome.storage.local.get(key);
  return result[key] as T | undefined;
}

async function setLocalValue(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function ensureTrustedStorageAccess(): Promise<void> {
  if (typeof chrome.storage.local.setAccessLevel !== 'function') {
    return;
  }

  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}

export async function loadSettings(): Promise<AppSettings> {
  const stored = await getLocalValue<Partial<AppSettings>>(STORAGE_KEYS.settings);
  return sanitizeSettings({ ...DEFAULT_SETTINGS, ...stored });
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const sanitized = sanitizeSettings(settings);
  await setLocalValue(STORAGE_KEYS.settings, sanitized);
  return sanitized;
}

export async function loadClassificationCache(): Promise<Record<string, ClassificationCacheRecord>> {
  return (await getLocalValue<Record<string, ClassificationCacheRecord>>(STORAGE_KEYS.cache)) ?? {};
}

export async function saveClassificationCache(
  cache: Record<string, ClassificationCacheRecord>
): Promise<void> {
  const ordered = Object.entries(cache)
    .sort(([, left], [, right]) => right.taggedAt.localeCompare(left.taggedAt))
    .slice(0, MAX_CACHE_RECORDS);

  await setLocalValue(STORAGE_KEYS.cache, Object.fromEntries(ordered));
}

export async function upsertClassificationRecord(record: ClassificationCacheRecord): Promise<void> {
  const cache = await loadClassificationCache();
  cache[record.signature] = record;
  await saveClassificationCache(cache);
}

export async function clearClassificationCache(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.cache);
}

export async function removeClassificationRecordsByUrls(urls: string[]): Promise<number> {
  const targets = new Set(urls.filter(Boolean));
  if (targets.size === 0) {
    return 0;
  }

  const cache = await loadClassificationCache();
  let removed = 0;
  for (const [key, record] of Object.entries(cache)) {
    if (targets.has(record.url)) {
      delete cache[key];
      removed += 1;
    }
  }

  await saveClassificationCache(cache);
  return removed;
}

export async function loadTabClassificationState(): Promise<
  Record<string, TabClassificationStateRecord>
> {
  return (
    (await getLocalValue<Record<string, TabClassificationStateRecord>>(STORAGE_KEYS.tabState)) ?? {}
  );
}

export async function upsertTabClassificationState(
  record: TabClassificationStateRecord
): Promise<void> {
  const state = await loadTabClassificationState();
  state[String(record.tabId)] = record;
  await setLocalValue(STORAGE_KEYS.tabState, state);
}

export async function removeTabClassificationStates(tabIds: number[]): Promise<number> {
  const uniqueIds = [...new Set(tabIds.filter((tabId) => Number.isInteger(tabId) && tabId > 0))];
  if (uniqueIds.length === 0) {
    return 0;
  }

  const state = await loadTabClassificationState();
  let removed = 0;
  for (const tabId of uniqueIds) {
    const key = String(tabId);
    if (state[key]) {
      delete state[key];
      removed += 1;
    }
  }

  await setLocalValue(STORAGE_KEYS.tabState, state);
  return removed;
}

export async function clearTabClassificationState(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.tabState);
}

export async function loadActivityLogs(): Promise<ActivityLogEntry[]> {
  return (await getLocalValue<ActivityLogEntry[]>(STORAGE_KEYS.activityLogs)) ?? [];
}

export async function appendActivityLog(
  level: ActivityLogEntry['level'],
  message: string,
  detail?: unknown
): Promise<void> {
  const logs = await loadActivityLogs();
  logs.unshift(buildLogEntry(level, message, detail));
  await setLocalValue(STORAGE_KEYS.activityLogs, logs.slice(0, MAX_ACTIVITY_LOGS));
}

export async function saveProviderHealth(status: ProviderHealthStatus): Promise<void> {
  await setLocalValue(STORAGE_KEYS.providerHealth, status);
}

export async function loadProviderHealth(): Promise<ProviderHealthStatus | undefined> {
  return getLocalValue<ProviderHealthStatus>(STORAGE_KEYS.providerHealth);
}

export async function resetDiagnostics(message: string): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEYS.activityLogs, STORAGE_KEYS.providerHealth]);
  await appendActivityLog('info', message);
}
