import { describe, expect, it } from 'vitest';
import { days, formatCompact, formatCountdown, formatMln, formatMoney, formatPct, formatShort, groupDigits, qty } from './format';

const sp = (s: string) => s.replace(/ /g, ' ');

describe('format', () => {
  it('группирует разряды по-русски', () => {
    expect(sp(groupDigits(10400000))).toBe('10 400 000');
    expect(sp(formatMoney(104000))).toBe('104 000 сум');
    expect(sp(groupDigits(999))).toBe('999');
  });
  it('короткая запись в млн', () => {
    expect(sp(formatMln(10400000))).toBe('10,4 млн');
    expect(sp(formatMln(300000))).toBe('0,3 млн');
    expect(sp(formatShort(200000))).toBe('200 тыс');
    expect(sp(formatShort(11300000))).toBe('11,3 млн');
  });
  it('компактная запись не теряет точность', () => {
    expect(sp(formatCompact(10_400_000))).toBe('10,4 млн');
    expect(sp(formatCompact(11_590_000))).toBe('11,59 млн');
    expect(sp(formatCompact(300_000))).toBe('0,3 млн');
    expect(sp(formatCompact(150_000))).toBe('150 тыс');
    expect(sp(qty(2000, 'пачка'))).toBe('2 000 пачек');
    expect(sp(qty(50000, 'шт'))).toBe('50 000 шт');
  });
  it('проценты и склонения', () => {
    expect(formatPct(7.9646)).toBe('8,0%');
    expect(sp(days(1))).toBe('1 день');
    expect(sp(days(3))).toBe('3 дня');
    expect(sp(days(7))).toBe('7 дней');
    expect(sp(days(11))).toBe('11 дней');
  });
  it('обратный отсчёт', () => {
    expect(sp(formatCountdown((28 * 3600 + 5 * 60) * 1000))).toBe('1 д 4 ч 5 мин');
    expect(formatCountdown(-1)).toBe('дедлайн прошёл');
  });
});
