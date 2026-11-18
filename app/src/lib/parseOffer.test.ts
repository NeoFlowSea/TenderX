import { describe, expect, it } from 'vitest';
import { parseAmounts, parseOfferText } from './parseOffer';

const ctx = {
  quantity: 50000,
  unit: 'шт',
  requirements: [
    { id: 'r1', text: 'Сертификат соответствия для контакта с пищевыми продуктами' },
    { id: 'r2', text: 'Подходят для горячих напитков (до 90 °C)' },
  ],
};

describe('parseAmounts', () => {
  it('понимает тыс / млн / пробелы', () => {
    const v = parseAmounts('10,2 млн, 200 тыс, 11 000 000, 200к').map((a) => a.value);
    expect(v).toEqual([10_200_000, 200_000, 11_000_000, 200_000]);
  });
  it('пропускает объём и размеры', () => {
    expect(parseAmounts('Стаканы 250мл, 80 мм').map((a) => a.value)).toEqual([]);
  });
});

describe('parseOfferText', () => {
  it('Telegram-сообщение из питча', () => {
    const r = parseOfferText('Стаканы 250мл 50000шт по 204 сум, доставка 200 тыс, 5 дней', ctx);
    expect(r.unitPrice).toBe(204);
    expect(r.quantity).toBe(50000);
    expect(r.goodsTotal).toBe(10_200_000);
    expect(r.deliveryCost).toBe(200_000);
    expect(r.deliveryDays).toBe(5);
    expect(r.warnings).toEqual([]);
  });

  it('цена за партию, доставка в млн, рабочие дни, сертификат', () => {
    const r = parseOfferText(
      'Здравствуйте! Можем поставить 50 000 стаканов 250 мл. Цена за партию 9,7 млн сум, доставка из Самарканда 1,1 млн, срок 6 рабочих дней. Сертификат есть.',
      ctx,
    );
    expect(r.goodsTotal).toBe(9_700_000);
    expect(r.unitPrice).toBe(194);
    expect(r.deliveryCost).toBe(1_100_000);
    expect(r.deliveryDays).toBe(6);
    expect(r.requirementsMentioned).toEqual(['r1']);
  });

  it('бесплатная доставка и цена за штуку через слэш', () => {
    const r = parseOfferText('Цена 220 сум/шт. Доставка бесплатно; отгрузка 3 дня, отсрочка оплаты 14 дней', ctx);
    expect(r.unitPrice).toBe(220);
    expect(r.goodsTotal).toBe(11_000_000);
    expect(r.deliveryCost).toBe(0);
    expect(r.deliveryDays).toBe(3);
  });

  it('итого с доставкой → товар = итого − доставка', () => {
    const r = parseOfferText('Итого с доставкой 10 400 000 сум; доставка 200 000', ctx);
    expect(r.goodsTotal).toBe(10_200_000);
    expect(r.deliveryCost).toBe(200_000);
  });

  it('другое количество → предупреждение и пересчёт на объём тендера', () => {
    const r = parseOfferText('30000 шт по 210 сум', ctx);
    expect(r.goodsTotal).toBe(10_500_000);
    expect(r.warnings.some((w) => w.includes('30000'))).toBe(true);
  });

  it('пустой текст', () => {
    const r = parseOfferText('   ', ctx);
    expect(r.goodsTotal).toBeNull();
  });
});
