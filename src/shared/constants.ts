import type { AppSettings } from './types.js';

export const STORAGE_KEYS = {
  settings: 'appSettings',
  cache: 'classificationCache',
  tabState: 'tabClassificationState',
  activityLogs: 'activityLogs',
  providerHealth: 'providerHealth'
} as const;

export const DEFAULT_SETTINGS: AppSettings = {
  enabled: true,
  language: 'auto',
  categories: [],
  categoryRules: {},
  promptSupplement: '',
  reclassifyOnUrlChange: false,
  providerType: 'openai-compatible',
  openAiCompatible: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: ''
  },
  chromeBuiltIn: {
    temperature: 0.2,
    topK: 3
  },
  contentCharacterLimit: 2400,
  alarmPeriodMinutes: 5
};

export const MAX_ACTIVITY_LOGS = 60;
export const MAX_CACHE_RECORDS = 500;
export const AUTOMATION_ALARM_NAME = 'auto-classify-tabs';
export const TAB_GROUP_COLOR_OPTIONS = [
  'grey',
  'blue',
  'cyan',
  'green',
  'orange',
  'pink',
  'purple',
  'red',
  'yellow'
] as const;
