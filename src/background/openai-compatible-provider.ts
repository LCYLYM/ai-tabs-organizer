import { buildDecisionSchema, buildSystemInstruction, buildUserPrompt } from '../shared/classification.js';
import type {
  ClassificationDecision,
  ClassificationRequestPayload,
  OpenAiCompatibleConfig
} from '../shared/types.js';
import { assertValidDecision, buildResponsesEndpoint, serializeError } from '../shared/utils.js';

function extractResponseText(data: Record<string, unknown>): string {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }

  const output = Array.isArray(data.output) ? data.output : [];
  const collected = output
    .flatMap((item) => {
      if (!item || typeof item !== 'object' || !Array.isArray((item as { content?: unknown[] }).content)) {
        return [];
      }
      return (item as { content: Array<Record<string, unknown>> }).content;
    })
    .map((content) => {
      if (typeof content.text === 'string') {
        return content.text;
      }

      if (typeof content.output_text === 'string') {
        return content.output_text;
      }

      return null;
    })
    .filter((value): value is string => Boolean(value && value.trim()));

  if (collected.length === 0) {
    throw new Error('OpenAI 响应中未找到可解析的文本输出。');
  }

  return collected.join('\n');
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
    const response = await fetch(buildResponsesEndpoint(config.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        input: [
          {
            role: 'developer',
            content: buildSystemInstruction(payload.categories, payload.promptSupplement)
          },
          {
            role: 'user',
            content: buildUserPrompt(payload)
          }
        ],
        text: {
          format: {
            type: 'json_schema',
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
