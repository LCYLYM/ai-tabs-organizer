import { buildDecisionSchema, buildSystemInstruction, buildUserPrompt } from './classification.js';
import type {
  ChromeBuiltInConfig,
  ClassificationDecision,
  ClassificationRequestPayload
} from './types.js';
import { assertValidDecision, serializeError } from './utils.js';

interface PromptApiSession {
  prompt(
    input: string,
    options?: {
      responseConstraint?: Record<string, unknown>;
      omitResponseConstraintInput?: boolean;
    }
  ): Promise<string>;
  destroy(): void;
}

interface PromptApiStatic {
  availability(options?: Record<string, unknown>): Promise<string>;
  create(options?: Record<string, unknown>): Promise<PromptApiSession>;
}

function getLanguageModel(): PromptApiStatic {
  const candidate = (globalThis as typeof globalThis & { LanguageModel?: PromptApiStatic })
    .LanguageModel;

  if (!candidate) {
    throw new Error('当前 Chrome 环境不支持 LanguageModel Prompt API。');
  }

  return candidate;
}

export async function getChromeBuiltInAvailability(
  config: ChromeBuiltInConfig
): Promise<string> {
  const languageModel = getLanguageModel();
  return languageModel.availability({
    temperature: config.temperature,
    topK: config.topK
  });
}

export async function warmupChromeBuiltInModel(config: ChromeBuiltInConfig): Promise<string> {
  const languageModel = getLanguageModel();
  const availability = await languageModel.availability({
    temperature: config.temperature,
    topK: config.topK
  });

  if (availability === 'unavailable') {
    throw new Error('当前设备或 Chrome 版本不支持内置 Prompt API。');
  }

  const session = await languageModel.create({
    temperature: config.temperature,
    topK: config.topK,
    initialPrompts: [
      {
        role: 'system',
        content: 'You are a classification engine used by a Chrome extension.'
      }
    ]
  });

  session.destroy();
  return `Chrome 内置 AI 已通过用户触发预热，availability=${availability}。`;
}

export async function classifyWithChromeBuiltIn(
  payload: ClassificationRequestPayload,
  config: ChromeBuiltInConfig
): Promise<ClassificationDecision> {
  try {
    const languageModel = getLanguageModel();
    const schema = buildDecisionSchema(payload.categories);
    const systemInstruction = buildSystemInstruction(payload.categories, payload.promptSupplement);
    const availability = await languageModel.availability({
      temperature: config.temperature,
      topK: config.topK
    });

    if (availability !== 'available') {
      throw new Error(
        `Chrome 内置 AI 当前不可直接用于后台分类，availability=${availability}。请先在设置页测试并预热模型。`
      );
    }

    const session = await languageModel.create({
      temperature: config.temperature,
      topK: config.topK,
      initialPrompts: [{ role: 'system', content: systemInstruction }]
    });

    try {
      const result = await session.prompt(buildUserPrompt(payload), {
        responseConstraint: schema,
        omitResponseConstraintInput: true
      });

      return assertValidDecision(JSON.parse(result) as ClassificationDecision, payload.categories);
    } finally {
      session.destroy();
    }
  } catch (error) {
    throw new Error(`Chrome 内置 AI 分类失败：${serializeError(error)}`);
  }
}
