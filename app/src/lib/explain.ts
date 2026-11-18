/**
 * Офлайн-объяснение рекомендации («Почему?») по правилам.
 * Использует только данные, уже посчитанные в analyzeTender — никаких внешних цен.
 */
import type { Analysis } from './analysis';
import { CORRIDOR_LABEL } from './analysis';
import type { Tender } from '../types';
import { days, formatCompact, formatMoney, formatPct, groupDigits } from './format';
import { parseAmounts } from './parseOffer';

export type PointKind = 'ok' | 'warn' | 'bad' | 'info';

export interface ExplanationPoint {
  kind: PointKind;
  text: string;
}

export interface Explanation {
  headline: string;
  points: ExplanationPoint[];
  source: 'rules' | 'claude';
}

function supplierName(a: { supplier?: { name: string }; bid: { supplierId: string } }): string {
  return a.supplier?.name ?? `Поставщик ${a.bid.supplierId}`;
}

export function explainRecommendation(analysis: Analysis, tender: Tender): Explanation {
  const { recommended: best, ranked, excluded, saving, market } = analysis;
  if (!best) {
    return {
      headline: 'Нет предложений, соответствующих ТЗ',
      points: excluded.map((e) => ({ kind: 'bad' as const, text: `${supplierName(e)} исключён: ${e.failures.join('; ')}.` })),
      source: 'rules',
    };
  }

  const points: ExplanationPoint[] = [];
  const name = supplierName(best);

  if (ranked.length > 1) {
    const cheaperExcluded = excluded.some((e) => e.fullCost < best.fullCost);
    points.push({
      kind: 'ok',
      text: `Минимальная полная стоимость${cheaperExcluded ? ' среди предложений, соответствующих ТЗ' : ''}: ${formatMoney(best.fullCost)} (товар ${formatCompact(best.bid.goodsPrice)} + доставка ${formatCompact(best.bid.deliveryCost)}).`,
    });
  } else {
    points.push({
      kind: 'info',
      text: `Единственное предложение, соответствующее ТЗ: ${formatMoney(best.fullCost)}. Сравнивать не с чем — проверьте цену по рыночному ориентиру.`,
    });
  }

  // Поставщики, у которых товар дешевле, но итог дороже из-за доставки
  for (const other of ranked) {
    if (other === best) continue;
    if (other.bid.goodsPrice < best.bid.goodsPrice) {
      points.push({
        kind: 'warn',
        text: `${supplierName(other)} дешевле по товару (${formatCompact(other.bid.goodsPrice)}), но доставка ${formatCompact(other.bid.deliveryCost)} делает закупку дороже на ${formatCompact(other.fullCost - best.fullCost)}.`,
      });
    }
  }

  points.push({
    kind: 'ok',
    text: `Все обязательные требования ТЗ подтверждены; срок поставки ${days(best.bid.deliveryDays)} (требование — не более ${days(tender.deliveryDays)}).`,
  });

  if (saving && analysis.mostExpensive) {
    points.push({
      kind: 'ok',
      text: `Экономия относительно самого дорогого предложения (${supplierName(analysis.mostExpensive)}): ${formatMoney(saving.abs)} (${formatPct(saving.pct)}).`,
    });
  }

  if (market && best.corridor) {
    points.push({
      kind: best.corridor === 'inside' ? 'ok' : 'warn',
      text: `Цена товара ${groupDigits(best.unitPrice)} сум/${market.unit} — ${CORRIDOR_LABEL[best.corridor]} демо-ориентира ${groupDigits(market.low)}–${groupDigits(market.high)} сум/${market.unit}.`,
    });
  }

  if (best.overBudget) {
    points.push({ kind: 'warn', text: `Полная стоимость превышает бюджет заказчика (${formatMoney(tender.budget!)}).` });
  }

  for (const e of excluded) {
    points.push({ kind: 'bad', text: `${supplierName(e)} исключён из рейтинга: ${e.failures.join('; ')}.` });
  }

  return {
    headline: `Рекомендуем: ${name} — ${formatMoney(best.fullCost)} с доставкой`,
    points,
    source: 'rules',
  };
}

/** Все числа, которые объяснение имеет право упоминать (для проверки ответа LLM) */
export function allowedNumbers(analysis: Analysis, tender: Tender): number[] {
  const out = new Set<number>([tender.quantity, tender.deliveryDays, Number(tender.number), 1, 100]);
  for (let i = 1; i <= analysis.bids.length; i++) out.add(i);
  if (tender.budget) out.add(tender.budget);
  for (const a of analysis.bids) {
    out.add(a.bid.goodsPrice);
    out.add(a.bid.deliveryCost);
    out.add(a.bid.deliveryDays);
    out.add(a.fullCost);
    out.add(Math.round(a.unitPrice));
    out.add(Math.round(a.fullUnitCost));
    if (a.deltaVsBest) out.add(a.deltaVsBest);
    for (const b of analysis.bids) {
      out.add(Math.abs(a.fullCost - b.fullCost));
      out.add(Math.abs(a.bid.goodsPrice - b.bid.goodsPrice));
      out.add(Math.abs(a.bid.deliveryCost - b.bid.deliveryCost));
    }
  }
  if (analysis.saving) {
    out.add(analysis.saving.abs);
    out.add(analysis.saving.pct);
  }
  if (analysis.market) {
    out.add(analysis.market.low);
    out.add(analysis.market.high);
  }
  // числа из названия товара и требований (например, «250 мл», «80 мм»)
  const texts = [tender.title, ...tender.requirements.map((r) => r.text)];
  for (const t of texts) for (const m of t.matchAll(/\d+(?:[.,]\d+)?/g)) out.add(Number(m[0].replace(',', '.')));
  return [...out];
}

/**
 * Находит в тексте числа, которых нет среди разрешённых (с допуском на округление).
 * Нужна, чтобы честно пометить ответ LLM, если он «придумал» цифру.
 */
export function findUnknownNumbers(text: string, allowed: number[]): string[] {
  const unknown: string[] = [];
  for (const a of parseAmounts(text, { keepUnits: true })) {
    const v = a.value;
    const ok = allowed.some((x) => Math.abs(x - v) <= Math.max(Math.abs(x) * 0.006, 0.051));
    if (!ok) unknown.push(a.raw.trim());
  }
  return unknown;
}
