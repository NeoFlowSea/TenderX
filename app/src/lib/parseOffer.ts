/**
 * Офлайн-разбор коммерческого предложения (КП) по правилам.
 * Вход — свободный текст (например, сообщение из Telegram),
 * выход — поля ставки для предзаполнения формы. Человек всегда проверяет результат.
 */
import type { Requirement } from '../types';

export interface Amount {
  value: number;
  raw: string;
  index: number;
  end: number;
  /** множитель найден в тексте (тыс / млн) */
  scaled: boolean;
  /** первые символы после числа (в нижнем регистре) */
  after: string;
}

const NUM_RE =
  /(\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,](\d+))?(?:\s*(млрд|млн|миллион[а-я]*|mln|mio|тысяч[а-я]*|тыс\.?|k(?![a-zа-яё])|к(?![a-zа-яё])))?/gi;

const MEASURE_RE = /^\s*(мл|ml|мм|mm|см|cm|л(?![a-zа-яё])|г(?![a-zа-яё])|гр(?![a-zа-яё])|gsm|г\/м|кг|%|°|х\s*\d|x\s*\d|×)/i;

function multiplierOf(word: string | undefined): number {
  if (!word) return 1;
  const w = word.toLowerCase();
  if (w.startsWith('млрд')) return 1e9;
  if (w.startsWith('млн') || w.startsWith('миллион') || w === 'mln' || w === 'mio') return 1e6;
  return 1e3; // тыс, тысяч, k, к
}

/** Все числа в тексте с учётом «тыс»/«млн» и разделителей разрядов. */
export function parseAmounts(text: string, opts: { keepUnits?: boolean } = {}): Amount[] {
  const out: Amount[] = [];
  for (const m of text.matchAll(NUM_RE)) {
    const index = m.index ?? 0;
    const end = index + m[0].length;
    const after = text.slice(end, end + 16).toLowerCase();
    // число, прилипшее к букве слева (например, «A4»), пропускаем
    if (index > 0 && /[a-zа-яё]/i.test(text[index - 1])) continue;
    if (!opts.keepUnits && !m[3] && MEASURE_RE.test(after)) continue;
    const intPart = m[1].replace(/[   ]/g, '');
    const num = Number(m[2] ? `${intPart}.${m[2]}` : intPart);
    if (!Number.isFinite(num)) continue;
    out.push({
      value: Math.round(num * multiplierOf(m[3]) * 1000) / 1000,
      raw: m[0],
      index,
      end,
      scaled: Boolean(m[3]),
      after,
    });
  }
  return out;
}

export interface ParsedOffer {
  unitPrice: number | null;
  quantity: number | null;
  goodsTotal: number | null;
  deliveryCost: number | null;
  deliveryDays: number | null;
  /** id требований, которые упомянуты в тексте КП */
  requirementsMentioned: string[];
  /** что и откуда извлечено — для прозрачности в UI */
  found: string[];
  warnings: string[];
}

export interface OfferContext {
  quantity: number;
  unit?: string;
  requirements: Requirement[];
}

const QTY_UNIT_RE = /^\s*(шт|штук|pcs|ед\.?(?![a-zа-яё])|единиц|пач|упак|рулон|коробок|стакан|крыш|салфет|контейнер|ланч)/i;
const PER_UNIT_RE = /^\s*(?:сум|sum|uzs|so['’]?m)?\.?\s*(?:\/|за\s+|per\s+)\s*(?:1\s*)?(шт|ед|единиц|штук|пач|упак|рулон)/i;
const CURRENCY_RE = /^\s*(сум|sum|uzs|so['’]?m)/i;
const DAYS_RE = /(\d+)(?:\s*[-–]\s*(\d+))?\s*(?:раб[а-я]*\.?\s+|календ[а-я]*\.?\s+)?(?:дн|день|дня|дней|сут)/i;

/** Делим текст на фразы: по ; переводу строки, «, » и «. » (запятая внутри «10,2» не режется) */
function splitClauses(text: string): string[] {
  return text
    .split(/[;\n]+|,\s+|\.\s+|!\s*|\?\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function stems(text: string): string[] {
  const generic = new Set(['поста', 'доста', 'товар', 'заказ', 'должн', 'более', 'менее', 'налич', 'наличи', 'котор']);
  return [...new Set(
    (text.toLowerCase().match(/[a-zа-яё]{5,}/gi) ?? [])
      .map((w) => w.slice(0, 5))
      .filter((s) => !generic.has(s)),
  )];
}

export function parseOfferText(text: string, ctx: OfferContext): ParsedOffer {
  const res: ParsedOffer = {
    unitPrice: null,
    quantity: null,
    goodsTotal: null,
    deliveryCost: null,
    deliveryDays: null,
    requirementsMentioned: [],
    found: [],
    warnings: [],
  };
  if (!text.trim()) return res;

  let fullTotal: number | null = null; // «итого с доставкой»
  const loose: Amount[] = [];

  for (const clause of splitClauses(text)) {
    const lc = clause.toLowerCase();
    const isPayment = /отсроч|оплат|предоплат|аванс|рассроч/.test(lc);
    const isDelivery = /достав|логист|транспорт|привез|привоз/.test(lc);

    // Срок поставки
    let dayIdx = -1;
    const dm = lc.match(DAYS_RE);
    if (dm && !isPayment) {
      dayIdx = dm.index ?? -1;
      if (res.deliveryDays === null) {
        res.deliveryDays = Number(dm[2] ?? dm[1]);
        res.found.push(`срок: ${res.deliveryDays} дн. ← «${dm[0].trim()}»`);
      }
    }

    const amounts = parseAmounts(clause).filter((a) => a.index !== dayIdx);
    if (isPayment) continue;

    if (isDelivery && !/итог|всего|общ[а-я]*\s+(стоим|сумм)/.test(lc)) {
      if (/бесплат|включ|за\s+наш\s+сч[её]т|free/.test(lc)) {
        if (res.deliveryCost === null) {
          res.deliveryCost = 0;
          res.found.push(`доставка: 0 ← «${clause}»`);
        }
      } else {
        const money = amounts.find((a) => !QTY_UNIT_RE.test(a.after));
        if (money && res.deliveryCost === null) {
          res.deliveryCost = money.value;
          res.found.push(`доставка: ${money.value} ← «${money.raw.trim()}»`);
        }
      }
      continue;
    }

    const isTotal = /итого|всего|сумма|общ[а-я]*\s+(стоим|сумм)|за\s+(парти|вс[её]|лот|объ[её]м|весь)/.test(lc);
    const withDelivery = /с\s+доставк|включая\s+доставк/.test(lc);

    for (const a of amounts) {
      const before = lc.slice(Math.max(0, a.index - 24), a.index);
      if (QTY_UNIT_RE.test(a.after)) {
        if (res.quantity === null) {
          res.quantity = a.value;
          res.found.push(`количество: ${a.value} ← «${a.raw.trim()}${a.after.match(QTY_UNIT_RE)?.[0] ?? ''}»`);
        }
        continue;
      }
      if (PER_UNIT_RE.test(a.after) || /(?:^|\s)по\s*$/.test(before) || /цена\s+за\s+(шт|ед)[а-я]*\.?\s*[:\-–]?\s*$/.test(before)) {
        if (res.unitPrice === null) {
          res.unitPrice = a.value;
          res.found.push(`цена за единицу: ${a.value} ← «${a.raw.trim()}»`);
        }
        continue;
      }
      if (isTotal) {
        if (withDelivery) {
          if (fullTotal === null) {
            fullTotal = a.value;
            res.found.push(`итого с доставкой: ${a.value} ← «${a.raw.trim()}»`);
          }
        } else if (res.goodsTotal === null) {
          res.goodsTotal = a.value;
          res.found.push(`цена за партию: ${a.value} ← «${a.raw.trim()}»`);
        }
        continue;
      }
      if (a.scaled || CURRENCY_RE.test(a.after) || /цен|стоим/.test(before)) loose.push(a);
    }
  }

  // Числа с валютой/«млн» без явного смысла: крупные — цена партии, мелкие — цена за единицу
  for (const a of loose) {
    if (a.value >= 100_000 && res.goodsTotal === null && res.unitPrice === null) {
      res.goodsTotal = a.value;
      res.found.push(`цена за партию (по величине): ${a.value} ← «${a.raw.trim()}»`);
    } else if (a.value < 100_000 && res.unitPrice === null && res.goodsTotal === null) {
      res.unitPrice = a.value;
      res.found.push(`цена за единицу (по величине): ${a.value} ← «${a.raw.trim()}»`);
    }
  }

  const textStems = new Set(stems(text));
  for (const r of ctx.requirements) {
    if (stems(r.text).some((s) => textStems.has(s))) res.requirementsMentioned.push(r.id);
  }

  return completeOffer({ ...res, fullTotal }, ctx);
}

/**
 * Общая детерминированная «досчитка» для обоих путей (правила и Claude):
 * LLM только извлекает поля, вся арифметика — здесь.
 */
export function completeOffer(raw: ParsedOffer & { fullTotal: number | null }, ctx: OfferContext): ParsedOffer {
  const { fullTotal, ...rest } = raw;
  const res: ParsedOffer = { ...rest, found: [...raw.found], warnings: [...raw.warnings] };

  if (res.goodsTotal === null && fullTotal !== null && res.deliveryCost !== null) {
    res.goodsTotal = fullTotal - res.deliveryCost;
    res.found.push(`товар = итого − доставка = ${res.goodsTotal}`);
  }

  if (res.quantity !== null && res.quantity !== ctx.quantity) {
    res.warnings.push(
      `В КП указано ${res.quantity} ${ctx.unit ?? 'ед.'}, а в тендере ${ctx.quantity}. Цена партии пересчитана на объём тендера — проверьте.`,
    );
  }
  if (res.goodsTotal === null && res.unitPrice !== null) {
    res.goodsTotal = Math.round(res.unitPrice * ctx.quantity);
    res.found.push(`цена за партию = ${res.unitPrice} × ${ctx.quantity}`);
  } else if (res.goodsTotal !== null && res.unitPrice === null && ctx.quantity > 0) {
    res.unitPrice = Math.round((res.goodsTotal / ctx.quantity) * 100) / 100;
  }

  if (res.goodsTotal === null) res.warnings.push('Не удалось найти цену — введите её вручную.');
  if (res.deliveryCost === null) res.warnings.push('Стоимость доставки не найдена — уточните у поставщика или введите вручную.');
  if (res.deliveryDays === null) res.warnings.push('Срок поставки не найден.');

  return res;
}
