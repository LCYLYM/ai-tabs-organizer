import { buildDecisionSchema, buildSystemInstruction, buildUserPrompt } from '../shared/classification.js';
import type {
  ClassificationDecision,
  ClassificationRequestPayload,
  OpenAiCompatibleConfig
} from '../shared/types.js';
import {
  assertValidDecision,
  buildChatCompletionsEndpoint,
  normalizeBaseUrl,
  serializeError
} from '../shared/utils.js';

function describeOpenAiCompatibleError(
  error: unknown,
  endpoint: string,
  baseUrl: string
): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return `OpenAI 兼容请求超时（45 秒）。endpoint=${endpoint}。请检查模型响应速度、网络稳定性，或降低页面正文采样长度后重试。`;
  }

  if (error instanceof TypeError && /Failed to fetch/i.test(error.message)) {
    return [
      'OpenAI 兼容请求未成功发出。',
      `baseUrl=${baseUrl}`,
      `endpoint=${endpoint}`,
      '请检查 Base URL 是否可直连、路径是否正确、证书是否有效，或目标服务是否允许浏览器扩展直接访问。'
    ].join(' ');
  }

  return serializeError(error);
}

function extractResponseText(data: Record<string, unknown>): string {
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0] as { message?: Record<string, unknown>; finish_reason?: string } | undefined;
  if (!firstChoice?.message || typeof firstChoice.message !== 'object') {
    throw new Error('OpenAI chat completions 响应中缺少 choices[0].message。');
  }

  const refusal = firstChoice.message.refusal;
  if (typeof refusal === 'string' && refusal.trim()) {
    throw new Error(`模型拒绝返回结果：${refusal}`);
  }

  const finishReason = firstChoice.finish_reason;
  if (finishReason === 'length') {
    throw new Error('模型输出因长度限制被截断，无法安全解析。');
  }
  if (finishReason === 'content_filter') {
    throw new Error('模型输出被内容过滤中断。');
  }

  const content = firstChoice.message.content;
  if (typeof content === 'string' && content.trim()) {
    return content;
  }

  throw new Error('OpenAI chat completions 响应中未找到可解析的 message.content。');
}

export async function classifyWithOpenAiCompatible(
  payload: ClassificationRequestPayload,
  config: OpenAiCompatibleConfig
): Promise<ClassificationDecision> {
  if (!config.baseUrl.trim()) {
    throw new Error('请先填写 OpenAI 兼容接口的 Base URL。');
  }
  if (!config.apiKey.trim()) {
    throw new Error('请先填写 OpenAI 兼容接口的 API Key。');
  }
  if (!config.model.trim()) {
    throw new Error('请先填写 OpenAI 兼容接口的模型名称。');
  }

  const normalizedBaseUrl = normalizeBaseUrl(config.baseUrl);
  const endpoint = buildChatCompletionsEndpoint(config.baseUrl);
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: 'system',
            content: buildSystemInstruction(payload.categories, payload.promptSupplement)
          },
          {
            role: 'user',
            content: buildUserPrompt(payload)
          }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'tab_classification',
            strict: true,
            schema: buildDecisionSchema(payload.categories)
          }
        }
      }),
      signal: controller.signal
    });

    const responseJson = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const detail =
        typeof responseJson.error === 'object'
          ? JSON.stringify(responseJson.error)
          : JSON.stringify(responseJson);
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${detail}`);
    }

    const decision = JSON.parse(extractResponseText(responseJson)) as ClassificationDecision;
    return assertValidDecision(decision, payload.categories);
  } catch (error) {
    throw new Error(
      `OpenAI 兼容分类失败：${describeOpenAiCompatibleError(error, endpoint, normalizedBaseUrl)}`
    );
  } finally {
    clearTimeout(timeout);
  }
}
