import type { ClassificationRequestPayload } from './types.js';

export function buildDecisionSchema(categories: string[]): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      shouldTag: {
        type: 'boolean',
        description:
          '仅当现有证据足够明确，且能可靠归入给定分类之一时返回 true；否则返回 false。'
      },
      category: {
        type: ['string', 'null'],
        enum: [...categories, null],
        description: '若 shouldTag 为 true，则必须是候选分类之一；否则为 null。'
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: '分类置信度，0 到 1。'
      },
      reason: {
        type: 'string',
        description: '用简体中文说明判断理由，避免空话。'
      },
      dominantSignal: {
        type: 'string',
        enum: ['title', 'domain', 'content', 'mixed', 'insufficient'],
        description: '主导判断的信号来源。'
      },
      evidence: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
        description: '列出 1 到 5 个关键证据，使用简体中文。'
      }
    },
    required: ['shouldTag', 'category', 'confidence', 'reason', 'dominantSignal', 'evidence']
  };
}

export function buildSystemInstruction(categories: string[], promptSupplement: string): string {
  const baseInstruction = [
    '你是一个用于 Chrome 标签页自动分类的严格分类引擎。',
    '你不能自由发挥，不允许创造新分类，只能在候选分类中选择，或明确表示不应打标。',
    '分类优先级必须严格遵守：页面标题 > 域名 > 页面正文内容。',
    '如果标题已经足够清晰，域名与正文只能作为佐证，不能轻易推翻标题信号。',
    '如果标题模糊，则再参考域名；只有前两者仍不足时才主要依赖正文。',
    '如果证据不足、页面主题混杂、或内容和分类目标关系不明确，必须返回 shouldTag=false 和 category=null。',
    '请尽量减少误判，宁可少打标，也不要错打标。',
    `候选分类如下：${categories.join(' / ')}。`
  ];

  if (promptSupplement.trim()) {
    baseInstruction.push(`用户补充规则：${promptSupplement.trim()}`);
  }

  return baseInstruction.join('\n');
}

export function buildUserPrompt(payload: ClassificationRequestPayload): string {
  const { pageSignals } = payload;
  return [
    '请根据以下页面信息判断是否应该打标，并仅使用给定候选分类：',
    `页面标题：${pageSignals.title || '(无标题)'}`,
    `域名：${pageSignals.domain || '(未知域名)'}`,
    `页面 URL：${pageSignals.url}`,
    `页面语言：${pageSignals.language || '(未知)'}`,
    `页面描述：${pageSignals.description || '(无描述)'}`,
    `标题层级摘要：${pageSignals.headings.length > 0 ? pageSignals.headings.join(' | ') : '(无标题层级)'}`,
    `正文节选：${pageSignals.contentExcerpt || '(无法提取正文内容)'}`,
    '请输出符合 JSON Schema 的结果。'
  ].join('\n');
}
