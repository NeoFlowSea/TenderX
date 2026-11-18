/**
 * Детерминированная бизнес-логика TenderX: полная стоимость, фильтр по ТЗ,
 * ранжирование, экономия, рыночный коридор, комиссия платформы.
 * Чистые функции — без React, без localStorage, без сети.
 */
import type { Bid, MarketPrice, Supplier, Tender, TenderStatus } from '../types';

export const PLATFORM_FEE_RATE = 0.01;

/** Полная стоимость закупки = товар + доставка */
export function fullCost(bid: Pick<Bid, 'goodsPrice' | 'deliveryCost'>): number {
  return bid.goodsPrice + bid.deliveryCost;
}

/** Комиссия платформы (платит поставщик): 1% от суммы сделки, округление до сума */
export function platformFee(dealTotal: number, rate = PLATFORM_FEE_RATE): number {
  return Math.round(dealTotal * rate);
}

/** Статус тендера с учётом текущего времени */
export function tenderStatus(tender: Tender, now: number): TenderStatus {
  if (tender.deal) return 'deal';
  if (tender.closedAt || new Date(tender.deadline).getTime() <= now) return 'opened';
  return 'open';
}

export const STATUS_LABEL: Record<TenderStatus, string> = {
  open: 'Приём ставок',
  opened: 'Вскрыт',
  deal: 'Сделка',
};

export interface ComplianceResult {
  compliant: boolean;
  /** человекочитаемые причины несоответствия */
  failures: string[];
}

/** Проверка обязательных требований ТЗ и срока поставки */
export function checkCompliance(tender: Tender, bid: Bid): ComplianceResult {
  const failures: string[] = [];
  for (const r of tender.requirements) {
    if (!bid.requirementsMet[r.id]) failures.push(`не подтверждено: «${r.text}»`);
  }
  if (bid.deliveryDays > tender.deliveryDays) {
    failures.push(`срок ${bid.deliveryDays} дн. больше требуемых ${tender.deliveryDays} дн.`);
  }
  return { compliant: failures.length === 0, failures };
}

export type CorridorPosition = 'below' | 'inside' | 'above';

export const CORRIDOR_LABEL: Record<CorridorPosition, string> = {
  below: 'ниже коридора',
  inside: 'в коридоре',
  above: 'выше коридора',
};

/** Где цена за единицу находится относительно рыночного коридора */
export function corridorPosition(unitPrice: number, market: Pick<MarketPrice, 'low' | 'high'>): CorridorPosition {
  if (unitPrice < market.low) return 'below';
  if (unitPrice > market.high) return 'above';
  return 'inside';
}

export interface AnalyzedBid {
  bid: Bid;
  supplier?: Supplier;
  fullCost: number;
  /** цена товара за единицу (без доставки) */
  unitPrice: number;
  /** полная стоимость за единицу */
  fullUnitCost: number;
  compliant: boolean;
  failures: string[];
  /** место среди соответствующих ТЗ (1 — лучшее), null если исключено */
  rank: number | null;
  corridor: CorridorPosition | null;
  /** превышает ли бюджет заказчика (null — бюджет не задан) */
  overBudget: boolean | null;
  /** насколько дороже рекомендованного (0 для рекомендованного) */
  deltaVsBest: number | null;
}

export interface Analysis {
  /** соответствующие ТЗ по рангу, затем исключённые */
  bids: AnalyzedBid[];
  ranked: AnalyzedBid[];
  excluded: AnalyzedBid[];
  recommended: AnalyzedBid | null;
  mostExpensive: AnalyzedBid | null;
  /** самый дешёвый по товару среди соответствующих ТЗ */
  cheapestGoods: AnalyzedBid | null;
  saving: { abs: number; pct: number } | null;
  market: MarketPrice | null;
}

/** Порядок: полная стоимость ↑, затем срок ↑, затем время подачи ↑ */
function compareBids(a: AnalyzedBid, b: AnalyzedBid): number {
  return (
    a.fullCost - b.fullCost ||
    a.bid.deliveryDays - b.bid.deliveryDays ||
    a.bid.submittedAt.localeCompare(b.bid.submittedAt)
  );
}

export function analyzeTender(
  tender: Tender,
  bids: Bid[],
  market: MarketPrice | null,
  suppliers: Supplier[] = [],
): Analysis {
  const items: AnalyzedBid[] = bids
    .filter((b) => b.tenderId === tender.id)
    .map((bid) => {
      const { compliant, failures } = checkCompliance(tender, bid);
      const total = fullCost(bid);
      const unitPrice = bid.goodsPrice / tender.quantity;
      return {
        bid,
        supplier: suppliers.find((s) => s.id === bid.supplierId),
        fullCost: total,
        unitPrice,
        fullUnitCost: total / tender.quantity,
        compliant,
        failures,
        rank: null,
        corridor: market ? corridorPosition(unitPrice, market) : null,
        overBudget: tender.budget ? total > tender.budget : null,
        deltaVsBest: null,
      };
    });

  const ranked = items.filter((i) => i.compliant).sort(compareBids);
  const excluded = items.filter((i) => !i.compliant).sort(compareBids);
  ranked.forEach((r, idx) => {
    r.rank = idx + 1;
    r.deltaVsBest = r.fullCost - ranked[0].fullCost;
  });

  const recommended = ranked[0] ?? null;
  const mostExpensive = ranked.length ? ranked[ranked.length - 1] : null;
  const cheapestGoods = ranked.length
    ? [...ranked].sort((a, b) => a.bid.goodsPrice - b.bid.goodsPrice)[0]
    : null;

  let saving: Analysis['saving'] = null;
  if (recommended && mostExpensive && ranked.length >= 2 && mostExpensive.fullCost > 0) {
    const abs = mostExpensive.fullCost - recommended.fullCost;
    saving = { abs, pct: (abs / mostExpensive.fullCost) * 100 };
  }

  return {
    bids: [...ranked, ...excluded],
    ranked,
    excluded,
    recommended,
    mostExpensive,
    cheapestGoods,
    saving,
    market,
  };
}
