import { buildDecisionSchema, buildSystemInstruction, buildUserPrompt } from '../shared/classification.js';
import type {
  ClassificationDecision,
  ClassificationRequestPayload,
  OpenAiCompatibleConfig
} from '../shared/types.js';
import { assertValidDecision, buildChatCompletionsEndpoint, serializeError } from '../shared/utils.js';

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

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(buildChatCompletionsEndpoint(config.baseUrl), {
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
    throw new Error(`OpenAI 兼容分类失败：${serializeError(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}
