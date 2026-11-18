/**
 * Проверка AI-пути без сети: SDK замокан, проверяем форму запроса и обработку ответа.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
const ctorArgs: unknown[] = [];

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status?: number;
  }
  class AuthenticationError extends APIError {}
  class PermissionDeniedError extends APIError {}
  class RateLimitError extends APIError {}
  class APIConnectionError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static PermissionDeniedError = PermissionDeniedError;
    static RateLimitError = RateLimitError;
    static APIConnectionError = APIConnectionError;
    beta = { messages: { create } };
    constructor(opts: unknown) {
      ctorArgs.push(opts);
    }
  }
  return { default: Anthropic };
});

import { CLAUDE_MODEL, ClaudeError, parseOfferWithClaude } from './claude';

const ctx = {
  title: 'Бумажные стаканы 250 мл',
  quantity: 50000,
  unit: 'шт',
  requirements: [{ id: 'r1', text: 'Сертификат соответствия' }],
};

function reply(json: unknown, stop_reason = 'end_turn') {
  return { stop_reason, content: [{ type: 'text', text: JSON.stringify(json) }] };
}

describe('parseOfferWithClaude', () => {
  beforeEach(() => {
    create.mockReset();
    ctorArgs.length = 0;
  });

  it('шлёт запрос из браузера с ключом пользователя и структурированным выводом', async () => {
    create.mockResolvedValue(
      reply({ unit_price: 204, quantity: 50000, goods_total: null, total_with_delivery: null, delivery_cost: 200000, delivery_days: 5, requirement_ids: ['r1', 'zzz'], notes: '' }),
    );
    const r = await parseOfferWithClaude('test-key', 'Стаканы 250мл 50000шт по 204 сум, доставка 200 тыс, 5 дней', ctx);

    expect(ctorArgs[0]).toMatchObject({ apiKey: 'test-key', dangerouslyAllowBrowser: true });
    const req = create.mock.calls[0][0];
    expect(req.model).toBe(CLAUDE_MODEL);
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.fallbacks).toBe('default');
    // арифметика — в коде, не в LLM
    expect(r.goodsTotal).toBe(10_200_000);
    expect(r.deliveryCost).toBe(200_000);
    expect(r.deliveryDays).toBe(5);
    expect(r.requirementsMentioned).toEqual(['r1']);
  });

  it('отказ модели → ClaudeError (UI переключится на правила)', async () => {
    create.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    await expect(parseOfferWithClaude('k', 'текст', ctx)).rejects.toBeInstanceOf(ClaudeError);
  });

  it('битый JSON → ClaudeError', async () => {
    create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] });
    await expect(parseOfferWithClaude('k', 'текст', ctx)).rejects.toBeInstanceOf(ClaudeError);
  });
});
