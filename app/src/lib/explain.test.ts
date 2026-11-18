import { describe, expect, it } from 'vitest';
import seed from '../data/seed.json';
import market from '../data/market_prices.json';
import { buildSeedState, type SeedFile } from './seed';
import { analyzeTender } from './analysis';
import { allowedNumbers, explainRecommendation, findUnknownNumbers } from './explain';
import type { MarketPrice } from '../types';

const state = buildSeedState(seed as unknown as SeedFile, new Date('2026-11-18T12:00:00+05:00'));
const t001 = state.tenders.find((t) => t.id === 't001')!;
const cups = (market.items as MarketPrice[]).find((m) => m.itemKey === 'cups_250')!;
const a = analyzeTender(t001, state.bids, cups, state.suppliers);
const sp = (s: string) => s.replace(/ /g, ' ');

describe('explainRecommendation (правила)', () => {
  const e = explainRecommendation(a, t001);
  const all = sp(e.points.map((p) => p.text).join('\n'));

  it('рекомендует B', () => {
    expect(sp(e.headline)).toContain('Поставщик B');
    expect(sp(e.headline)).toContain('10 400 000 сум');
  });
  it('объясняет, почему C проигрывает из-за доставки', () => {
    expect(all).toContain('Поставщик C дешевле по товару (9,7 млн), но доставка 1,1 млн');
    expect(all).toContain('дороже на 0,4 млн');
  });
  it('считает экономию', () => {
    expect(all).toContain('900 000 сум (8,0%)');
  });
  it('цитирует только числа из приложения', () => {
    expect(findUnknownNumbers(all, allowedNumbers(a, t001))).toEqual([]);
  });
});

describe('findUnknownNumbers', () => {
  it('ловит выдуманную цифру', () => {
    const unknown = findUnknownNumbers('Рыночная цена 180 сум, B — 10,4 млн, экономия 8%', allowedNumbers(a, t001));
    expect(unknown).toEqual(['180']);
  });
});
