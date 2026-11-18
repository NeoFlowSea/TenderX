/**
 * AI-путь через Claude API. Используется ТОЛЬКО если пользователь ввёл свой ключ в «Настройках».
 * Ключ хранится в localStorage, запрос идёт прямо из браузера в api.anthropic.com
 * (SDK с dangerouslyAllowBrowser добавляет заголовок anthropic-dangerous-direct-browser-access: true).
 *
 * Принцип честности: LLM только извлекает поля / формулирует текст.
 * Вся арифметика и рейтинг — детерминированный код в src/lib/.
 */
import type { Analysis } from '../lib/analysis';
import { CORRIDOR_LABEL } from '../lib/analysis';
import { completeOffer, type OfferContext, type ParsedOffer } from '../lib/parseOffer';
import { allowedNumbers, findUnknownNumbers, type Explanation, type PointKind } from '../lib/explain';
import type { Tender } from '../types';

export const CLAUDE_MODEL = 'claude-opus-5-5';

export class ClaudeError extends Error {}

async function getClient(apiKey: string) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 90_000 });
}

async function callJson<T>(apiKey: string, system: string, user: string, schema: Record<string, unknown>): Promise<T> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = await getClient(apiKey);
  try {
    const res = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      // при отказе классификатора безопасности API сам повторит запрос на запасной модели
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal') throw new ClaudeError('Claude отказался обрабатывать запрос.');
    if (res.stop_reason === 'max_tokens') throw new ClaudeError('Ответ Claude обрезан (max_tokens).');
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ClaudeError('Claude вернул некорректный JSON.');
    }
  } catch (e) {
    if (e instanceof ClaudeError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ClaudeError('Неверный API-ключ (401). Проверьте ключ в настройках.');
    if (e instanceof Anthropic.PermissionDeniedError) throw new ClaudeError('Нет доступа к модели (403).');
    if (e instanceof Anthropic.RateLimitError) throw new ClaudeError('Превышен лимит запросов (429). Попробуйте позже.');
    if (e instanceof Anthropic.APIConnectionError) throw new ClaudeError('Нет соединения с api.anthropic.com.');
    if (e instanceof Anthropic.APIError) throw new ClaudeError(`Ошибка API ${e.status ?? ''}: ${e.message}`);
    throw new ClaudeError(e instanceof Error ? e.message : String(e));
  }
}

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };

const OFFER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['unit_price', 'quantity', 'goods_total', 'total_with_delivery', 'delivery_cost', 'delivery_days', 'requirement_ids', 'notes'],
  properties: {
    unit_price: { ...nullableNumber, description: 'Цена товара за единицу в сумах, если указана' },
    quantity: { ...nullableNumber, description: 'Количество в КП, если указано' },
    goods_total: { ...nullableNumber, description: 'Цена за всю партию БЕЗ доставки, если указана явно' },
    total_with_delivery: { ...nullableNumber, description: 'Итоговая сумма С доставкой, если указана явно' },
    delivery_cost: { ...nullableNumber, description: 'Стоимость доставки в сумах; 0 если доставка бесплатная/включена' },
    delivery_days: { ...nullableNumber, description: 'Срок поставки в днях (если диапазон — верхняя граница)' },
    requirement_ids: { type: 'array', items: { type: 'string' }, description: 'id требований, которые КП явно подтверждает' },
    notes: { type: 'string', description: 'Короткое примечание на русском: что неясно или требует проверки' },
  },
};

interface OfferJson {
  unit_price: number | null;
  quantity: number | null;
  goods_total: number | null;
  total_with_delivery: number | null;
  delivery_cost: number | null;
  delivery_days: number | null;
  requirement_ids: string[];
  notes: string;
}

export async function parseOfferWithClaude(apiKey: string, text: string, ctx: OfferContext & { title: string }): Promise<ParsedOffer> {
  const system =
    'Ты извлекаешь поля из коммерческого предложения (КП) поставщика для B2B-тендера в Узбекистане. ' +
    'Валюта — узбекский сум. «тыс» = 1 000, «млн» = 1 000 000. Возвращай только то, что явно написано в тексте; ' +
    'если поля нет — null. Ничего не вычисляй и не додумывай. Объём упаковки (мл, мм) — это не цена и не количество.';
  const user = [
    `Тендер: ${ctx.title}, ${ctx.quantity} ${ctx.unit ?? 'ед.'}.`,
    'Обязательные требования (id: текст):',
    ...ctx.requirements.map((r) => `- ${r.id}: ${r.text}`),
    '',
    'Текст КП:',
    '<kp>',
    text,
    '</kp>',
  ].join('\n');

  const j = await callJson<OfferJson>(apiKey, system, user, OFFER_SCHEMA);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  const validIds = new Set(ctx.requirements.map((r) => r.id));
  const found: string[] = [];
  if (num(j.unit_price) !== null) found.push(`цена за единицу: ${j.unit_price}`);
  if (num(j.quantity) !== null) found.push(`количество: ${j.quantity}`);
  if (num(j.goods_total) !== null) found.push(`цена за партию: ${j.goods_total}`);
  if (num(j.total_with_delivery) !== null) found.push(`итого с доставкой: ${j.total_with_delivery}`);
  if (num(j.delivery_cost) !== null) found.push(`доставка: ${j.delivery_cost}`);
  if (num(j.delivery_days) !== null) found.push(`срок: ${j.delivery_days} дн.`);

  return completeOffer(
    {
      unitPrice: num(j.unit_price),
      quantity: num(j.quantity),
      goodsTotal: num(j.goods_total),
      fullTotal: num(j.total_with_delivery),
      deliveryCost: num(j.delivery_cost),
      deliveryDays: num(j.delivery_days) !== null ? Math.ceil(j.delivery_days as number) : null,
      requirementsMentioned: (Array.isArray(j.requirement_ids) ? j.requirement_ids : []).filter((id) => validIds.has(id)),
      found,
      warnings: j.notes?.trim() ? [`Claude: ${j.notes.trim()}`] : [],
    },
    ctx,
  );
}

const EXPLAIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'points'],
  properties: {
    headline: { type: 'string' },
    points: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'text'],
        properties: {
          kind: { type: 'string', enum: ['ok', 'warn', 'bad', 'info'] },
          text: { type: 'string' },
        },
      },
    },
  },
};

export async function explainWithClaude(
  apiKey: string,
  analysis: Analysis,
  tender: Tender,
): Promise<Explanation & { unknownNumbers: string[] }> {
  const facts = {
    tender: {
      number: tender.number,
      title: tender.title,
      quantity: tender.quantity,
      unit: tender.unit,
      region: tender.region,
      max_delivery_days: tender.deliveryDays,
      budget_uzs: tender.budget ?? null,
      requirements: tender.requirements.map((r) => r.text),
    },
    bids: analysis.bids.map((a) => ({
      supplier: a.supplier?.name ?? a.bid.supplierId,
      goods_uzs: a.bid.goodsPrice,
      delivery_uzs: a.bid.deliveryCost,
      full_cost_uzs: a.fullCost,
      unit_price_uzs: Math.round(a.unitPrice),
      delivery_days: a.bid.deliveryDays,
      meets_requirements: a.compliant,
      failures: a.failures,
      rank: a.rank,
      more_than_best_uzs: a.deltaVsBest,
      market_corridor_position: a.corridor ? CORRIDOR_LABEL[a.corridor] : null,
    })),
    recommended: analysis.recommended?.supplier?.name ?? null,
    saving_vs_most_expensive: analysis.saving
      ? { uzs: analysis.saving.abs, percent: Math.round(analysis.saving.pct * 10) / 10, most_expensive: analysis.mostExpensive?.supplier?.name }
      : null,
    market_corridor: analysis.market
      ? { low_uzs_per_unit: analysis.market.low, high_uzs_per_unit: analysis.market.high, unit: analysis.market.unit, source: analysis.market.source }
      : null,
  };

  const system =
    'Ты — аналитик закупок TenderX. Объясни заказчику на русском, почему рекомендован поставщик. ' +
    'Рекомендация и все числа уже посчитаны кодом — НЕ меняй выбор и НЕ пересчитывай. ' +
    'Используй ТОЛЬКО числа из переданных данных. Не упоминай никаких рыночных цен, источников или фактов, которых нет в данных. ' +
    'Рыночный коридор — иллюстративные демо-данные, так и называй его. Суммы пиши по-русски: «10,4 млн сум» или «900 000 сум». ' +
    'Дай заголовок и 3–5 коротких пунктов (kind: ok — довод за, warn — компромисс/риск, bad — исключение, info — справка).';
  const user = `Данные тендера (JSON):\n${JSON.stringify(facts, null, 2)}`;

  const j = await callJson<{ headline: string; points: { kind: PointKind; text: string }[] }>(apiKey, system, user, EXPLAIN_SCHEMA);
  const points = (Array.isArray(j.points) ? j.points : []).filter((p) => p && typeof p.text === 'string');
  const allText = [j.headline, ...points.map((p) => p.text)].join('\n');
  return {
    headline: j.headline ?? '',
    points,
    source: 'claude',
    unknownNumbers: findUnknownNumbers(allText, allowedNumbers(analysis, tender)),
  };
}
