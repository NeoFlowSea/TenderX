import { describe, expect, it } from 'vitest';
import seed from '../data/seed.json';
import market from '../data/market_prices.json';
import { buildSeedState, type SeedFile } from './seed';
import { analyzeTender, checkCompliance, corridorPosition, fullCost, platformFee, tenderStatus } from './analysis';
import type { MarketPrice } from '../types';

const NOW = new Date('2026-11-18T12:00:00+05:00');
const state = buildSeedState(seed as unknown as SeedFile, NOW);
const t001 = state.tenders.find((t) => t.id === 't001')!;
const cups = (market.items as MarketPrice[]).find((m) => m.itemKey === 'cups_250')!;

describe('тендер #001 совпадает с питчем', () => {
  const a = analyzeTender(t001, state.bids, cups, state.suppliers);

  it('полная стоимость = товар + доставка', () => {
    const totals = Object.fromEntries(a.bids.map((b) => [b.bid.supplierId, b.fullCost]));
    expect(totals).toEqual({ A: 11_300_000, B: 10_400_000, C: 10_800_000 });
  });

  it('рейтинг по полной стоимости: B, C, A; рекомендован B', () => {
    expect(a.ranked.map((r) => r.bid.supplierId)).toEqual(['B', 'C', 'A']);
    expect(a.recommended?.bid.supplierId).toBe('B');
    expect(a.cheapestGoods?.bid.supplierId).toBe('C');
  });

  it('экономия против самого дорогого (A): 900 000 сум ≈ 8,0%', () => {
    expect(a.mostExpensive?.bid.supplierId).toBe('A');
    expect(a.saving?.abs).toBe(900_000);
    expect(a.saving!.pct).toBeCloseTo(7.96, 2);
  });

  it('все соответствуют ТЗ', () => {
    expect(a.excluded).toHaveLength(0);
  });

  it('коридор: A выше, B и C в коридоре', () => {
    const pos = Object.fromEntries(a.bids.map((b) => [b.bid.supplierId, b.corridor]));
    expect(pos).toEqual({ A: 'above', B: 'inside', C: 'inside' });
  });

  it('тендер #001 засеян вскрытым', () => {
    expect(tenderStatus(t001, NOW.getTime())).toBe('opened');
  });
});

describe('фильтр по ТЗ', () => {
  it('ставка без подтверждения требования исключается из рейтинга', () => {
    const bids = state.bids.map((b) =>
      b.tenderId === 't001' && b.supplierId === 'B' ? { ...b, requirementsMet: { ...b.requirementsMet, r2: false } } : b,
    );
    const a = analyzeTender(t001, bids, cups, state.suppliers);
    expect(a.recommended?.bid.supplierId).toBe('C');
    expect(a.excluded.map((e) => e.bid.supplierId)).toEqual(['B']);
    expect(a.excluded[0].rank).toBeNull();
    expect(a.saving?.abs).toBe(500_000);
  });

  it('срок больше требуемого — несоответствие', () => {
    const bid = { ...state.bids.find((b) => b.id === 't001-A')!, deliveryDays: 9 };
    const r = checkCompliance(t001, bid);
    expect(r.compliant).toBe(false);
    expect(r.failures[0]).toContain('9');
  });

  it('при одной подходящей ставке экономия не считается', () => {
    const a = analyzeTender(t001, state.bids.filter((b) => b.supplierId === 'A'), cups);
    expect(a.recommended?.bid.supplierId).toBe('A');
    expect(a.saving).toBeNull();
  });
});

describe('прочее', () => {
  it('комиссия 1% с поставщика: 10,4 млн → 104 000', () => {
    expect(platformFee(10_400_000)).toBe(104_000);
  });
  it('fullCost', () => {
    expect(fullCost({ goodsPrice: 9_700_000, deliveryCost: 1_100_000 })).toBe(10_800_000);
  });
  it('corridorPosition', () => {
    expect(corridorPosition(189, cups)).toBe('below');
    expect(corridorPosition(190, cups)).toBe('inside');
    expect(corridorPosition(216, cups)).toBe('above');
  });
  it('открытые тендеры принимают ставки, ставки скрыты', () => {
    const t002 = state.tenders.find((t) => t.id === 't002')!;
    expect(tenderStatus(t002, NOW.getTime())).toBe('open');
    expect(tenderStatus({ ...t002, closedAt: NOW.toISOString() }, NOW.getTime())).toBe('opened');
    expect(
      tenderStatus({ ...t002, deal: { bidId: 'x', supplierId: 'A', total: 1, fee: 0, confirmedAt: '' } }, NOW.getTime()),
    ).toBe('deal');
  });
});
