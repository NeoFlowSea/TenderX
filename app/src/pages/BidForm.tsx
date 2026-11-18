import { useEffect, useMemo, useState } from 'react';
import { actions, marketFor, useAppState } from '../store';
import { useNow } from '../hooks';
import { fullCost, tenderStatus } from '../lib/analysis';
import { days, formatCompact, formatMoney, groupDigits } from '../lib/format';
import { parseOfferText, type ParsedOffer } from '../lib/parseOffer';
import { Countdown, Field, NotFound, SourceBadge } from '../components/ui';
import { TenderHeader } from './TenderDetail';
import { getApiKey, useApiKey } from '../ai/settings';
import { ClaudeError, parseOfferWithClaude } from '../ai/claude';
import type { SupplierId, Tender } from '../types';
import { navigate, useRoute } from '../router';

function toNumber(s: string): number {
  const v = Number(s.replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
}
const fmtInput = (n: number) => groupDigits(n).replace(/ /g, ' ');

/** Примеры «живых» КП из Telegram для демо */
function exampleOffer(t: Tender, sid: SupplierId): string {
  if (t.itemKey === 'cups_250' && t.quantity === 50000) {
    return {
      A: 'Добрый день! Стаканы 250 мл, 50 000 шт по 220 сум/шт. Доставка по Ташкенту 300 тыс, срок 3 дня. Сертификат для пищевых продуктов есть, подходят для горячих напитков.',
      B: 'Стаканы 250мл 50000шт по 204 сум, доставка 200 тыс, 5 дней',
      C: 'Здравствуйте! Можем поставить 50 000 стаканов 250 мл. Цена за партию 9,7 млн сум, доставка из Самарканда 1,1 млн, срок 6 рабочих дней. Сертификат есть.',
    }[sid];
  }
  const m = marketFor(t.itemKey);
  const mid = m ? Math.round((m.low + m.high) / 2) : 1000;
  const price = { A: Math.round(mid * 1.04), B: Math.round(mid * 0.98), C: Math.round(mid * 0.9) }[sid];
  const delivery = { A: '150 тыс', B: '200 тыс', C: '900 тыс' }[sid];
  const d = { A: 2, B: Math.min(5, t.deliveryDays), C: 4 }[sid];
  return `${t.title}, ${t.quantity} ${t.unit} по ${price} сум, доставка ${delivery}, срок ${days(d).replace(/ /g, ' ')}`;
}

type FieldKey = 'goods' | 'unit' | 'delivery' | 'days';

export function BidForm({ id }: { id: string }) {
  const s = useAppState();
  const now = useNow(1000);
  const apiKey = useApiKey();
  const t = s.tenders.find((x) => x.id === id);

  // экран поставщика: прямой URL переключает роль (?as=A|B|C выбирает поставщика)
  const as = useRoute().query.get('as');
  useEffect(() => {
    if (as === 'A' || as === 'B' || as === 'C') actions.setSupplier(as);
    else actions.setRole('supplier');
  }, [as]);

  const sid = s.supplierId;
  const existing = t ? s.bids.find((b) => b.tenderId === t.id && b.supplierId === sid) : undefined;

  const [mode, setMode] = useState<'lot' | 'unit'>('lot');
  const [goods, setGoods] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [delivery, setDelivery] = useState('');
  const [dDays, setDDays] = useState('');
  const [reqs, setReqs] = useState<Record<string, boolean>>({});
  const [comment, setComment] = useState('');
  const [filled, setFilled] = useState<Set<FieldKey>>(new Set());
  const [mentioned, setMentioned] = useState<Set<string>>(new Set());
  const [filledBy, setFilledBy] = useState<'manual' | 'rules' | 'claude'>('manual');
  const [offer, setOffer] = useState('');
  const [parsed, setParsed] = useState<{ r: ParsedOffer; source: 'rules' | 'claude'; fallbackReason?: string } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitted, setSubmitted] = useState(false);

  // при смене поставщика — подгрузить его ставку или очистить форму
  useEffect(() => {
    setSubmitted(false);
    setParsed(null);
    setOffer('');
    setFilled(new Set());
    setMentioned(new Set());
    setErrors({});
    setFilledBy('manual');
    if (existing) {
      setMode('lot');
      setGoods(fmtInput(existing.goodsPrice));
      setUnitPrice('');
      setDelivery(fmtInput(existing.deliveryCost));
      setDDays(String(existing.deliveryDays));
      setReqs(existing.requirementsMet);
      setComment(existing.comment);
    } else {
      setGoods('');
      setUnitPrice('');
      setDelivery('');
      setDDays('');
      setReqs({});
      setComment('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sid, id]);

  // демо-ссылка: ?kp=example (или ?kp=<текст>) — вставить КП и сразу разобрать правилами
  const kp = useRoute().query.get('kp');
  useEffect(() => {
    if (!t || !kp || tenderStatus(t, Date.now()) !== 'open') return;
    const text = kp === 'example' ? exampleOffer(t, sid) : kp;
    setOffer(text);
    const r = parseOfferText(text, { quantity: t.quantity, unit: t.unit, requirements: t.requirements });
    setParsed({ r, source: 'rules' });
    applyParsed(r, 'rules', text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kp, sid, id]);

  const goodsValue = useMemo(() => {
    if (!t) return NaN;
    return mode === 'lot' ? toNumber(goods) : Math.round(toNumber(unitPrice) * t.quantity);
  }, [mode, goods, unitPrice, t]);

  if (!t) return <NotFound what="Тендер" />;
  const status = tenderStatus(t, now);
  const supplier = s.suppliers.find((x) => x.id === sid);
  const deliveryValue = toNumber(delivery || 'x');
  const daysValue = toNumber(dDays || 'x');
  const total = Number.isFinite(goodsValue) && Number.isFinite(deliveryValue) ? fullCost({ goodsPrice: goodsValue, deliveryCost: deliveryValue }) : NaN;
  const unconfirmed = t.requirements.filter((r) => !reqs[r.id]);
  const tooSlow = Number.isFinite(daysValue) && daysValue > t.deliveryDays;

  function applyParsed(r: ParsedOffer, source: 'rules' | 'claude', text = offer) {
    const f = new Set<FieldKey>();
    if (r.goodsTotal !== null) {
      setMode('lot');
      setGoods(fmtInput(r.goodsTotal));
      f.add('goods');
    }
    if (r.deliveryCost !== null) {
      setDelivery(fmtInput(r.deliveryCost));
      f.add('delivery');
    }
    if (r.deliveryDays !== null) {
      setDDays(String(r.deliveryDays));
      f.add('days');
    }
    setFilled(f);
    setMentioned(new Set(r.requirementsMentioned));
    setReqs((prev) => {
      const next = { ...prev };
      for (const rid of r.requirementsMentioned) next[rid] = true;
      return next;
    });
    if (!comment.trim()) setComment(`КП: ${text.trim().slice(0, 200)}`);
    setFilledBy(source);
  }

  async function runParse() {
    if (!t || !offer.trim()) return;
    const ctx = { quantity: t.quantity, unit: t.unit, requirements: t.requirements, title: t.title };
    const key = getApiKey();
    if (key) {
      setParsing(true);
      try {
        const r = await parseOfferWithClaude(key, offer, ctx);
        setParsed({ r, source: 'claude' });
        applyParsed(r, 'claude');
      } catch (e) {
        const r = parseOfferText(offer, ctx);
        setParsed({ r, source: 'rules', fallbackReason: e instanceof ClaudeError ? e.message : 'Ошибка вызова Claude' });
        applyParsed(r, 'rules');
      } finally {
        setParsing(false);
      }
    } else {
      const r = parseOfferText(offer, ctx);
      setParsed({ r, source: 'rules' });
      applyParsed(r, 'rules');
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!t) return;
    const errs: Partial<Record<FieldKey, string>> = {};
    if (!Number.isFinite(goodsValue) || goodsValue <= 0) errs[mode === 'lot' ? 'goods' : 'unit'] = 'Укажите цену больше нуля';
    if (!Number.isFinite(deliveryValue) || deliveryValue < 0) errs.delivery = 'Укажите стоимость доставки (0 — если бесплатно)';
    if (!Number.isInteger(daysValue) || daysValue < 1 || daysValue > 365) errs.days = 'Срок — целое число дней';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    actions.submitBid({
      tenderId: t.id,
      supplierId: sid,
      goodsPrice: goodsValue,
      deliveryCost: deliveryValue,
      deliveryDays: daysValue,
      requirementsMet: Object.fromEntries(t.requirements.map((r) => [r.id, Boolean(reqs[r.id])])),
      comment: comment.trim(),
      filledBy,
    });
    setSubmitted(true);
    window.scrollTo(0, 0);
  }

  const lockBanner = (
    <div className="banner lock" style={{ marginBottom: 16 }}>
      <span>🔒</span>
      <span className="grow">
        <b>Цены других поставщиков скрыты до дедлайна.</b> Ваша цена тоже не видна конкурентам.
      </span>
      <span className="cd">
        осталось <Countdown deadline={t.deadline} />
      </span>
    </div>
  );

  if (status !== 'open') {
    return (
      <div className="container">
        <TenderHeader t={t} />
        <div className="card">
          <h2>Приём ставок завершён</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            {existing
              ? `Ваша ставка: ${formatMoney(fullCost(existing))} с доставкой, срок ${days(existing.deliveryDays)}.`
              : `Поставщик ${sid} не подавал ставку в этом тендере.`}{' '}
            {t.deal ? (t.deal.supplierId === sid ? '🎉 Заказчик выбрал вашу ставку.' : 'Заказчик выбрал другого поставщика.') : 'Заказчик сравнивает предложения.'}
          </p>
          <a className="btn secondary" href="#/" style={{ marginTop: 14 }}>
            ← К тендерам
          </a>
        </div>
      </div>
    );
  }

  if (submitted && existing) {
    const others = (['A', 'B', 'C'] as SupplierId[]).filter((x) => x !== sid);
    return (
      <div className="container">
        <TenderHeader t={t} />
        {lockBanner}
        <div className="card">
          <div className="banner ok" style={{ marginBottom: 14 }}>
            ✓ <b>Закрытая ставка {supplier?.name} отправлена.</b> Заказчик увидит её только после дедлайна.
          </div>
          <div className="sum-rows" style={{ maxWidth: 420 }}>
            <div className="r">
              <span>Товар</span>
              <span className="num">{formatMoney(existing.goodsPrice)}</span>
            </div>
            <div className="r">
              <span>Доставка</span>
              <span className="num">{formatMoney(existing.deliveryCost)}</span>
            </div>
            <div className="r total">
              <span>Полная стоимость</span>
              <span className="num">{formatMoney(fullCost(existing))}</span>
            </div>
          </div>
          {unconfirmed.length > 0 && (
            <div className="banner warn" style={{ marginTop: 14 }}>
              ⚠ Не подтверждено требований: {unconfirmed.length}. Ставка будет отмечена как несоответствующая ТЗ.
            </div>
          )}
          <div className="form-actions">
            <button className="btn secondary" onClick={() => setSubmitted(false)}>
              Изменить ставку
            </button>
            {others.map((o) => (
              <button
                key={o}
                className="btn secondary"
                onClick={() => {
                  actions.setSupplier(o);
                  navigate(`/tender/${t.id}/bid?as=${o}`);
                }}
              >
                Подать как Поставщик {o} (демо)
              </button>
            ))}
            <a className="btn ghost" href="#/">
              К тендерам
            </a>
          </div>
        </div>
      </div>
    );
  }

  const fieldClass = (k: FieldKey, err?: string) => `input${err ? ' invalid' : filled.has(k) ? ' filled' : ''}`;

  return (
    <div className="container">
      <TenderHeader t={t}>
        <span className="pill grey" style={{ fontSize: 13, padding: '6px 12px' }}>
          Вы: {supplier?.name} · {supplier?.city}
        </span>
      </TenderHeader>
      {lockBanner}

      <div className="grid-2">
        <form className="card" onSubmit={submit} noValidate>
          <div className="row between" style={{ marginBottom: 14 }}>
            <h2>{existing ? 'Изменить закрытую ставку' : 'Закрытая ставка'}</h2>
            <div className="seg light" role="group" aria-label="Способ указания цены">
              <button type="button" className={mode === 'lot' ? 'on' : ''} onClick={() => setMode('lot')}>
                Цена за лот
              </button>
              <button
                type="button"
                className={mode === 'unit' ? 'on' : ''}
                onClick={() => {
                  setMode('unit');
                  if (!unitPrice && Number.isFinite(goodsValue) && goodsValue > 0) setUnitPrice(String(Math.round((goodsValue / t.quantity) * 100) / 100).replace('.', ','));
                }}
              >
                Цена × количество
              </button>
            </div>
          </div>

          <div className="form-grid">
            {mode === 'lot' ? (
              <Field label={`Цена товара за весь лот (${groupDigits(t.quantity)} ${t.unit})`} error={errors.goods} htmlFor="goods" hint={Number.isFinite(goodsValue) && goodsValue > 0 ? `= ${groupDigits(Math.round((goodsValue / t.quantity) * 100) / 100)} сум за ${t.unit}` : undefined}>
                <div className="input-group">
                  <input id="goods" className={fieldClass('goods', errors.goods)} inputMode="numeric" value={goods} onChange={(e) => setGoods(e.target.value)} placeholder="10 200 000" />
                  <span className="addon">сум</span>
                </div>
              </Field>
            ) : (
              <Field label={`Цена за ${t.unit}`} error={errors.unit} htmlFor="unitp" hint={Number.isFinite(goodsValue) && goodsValue > 0 ? `× ${groupDigits(t.quantity)} = ${formatMoney(goodsValue)}` : undefined}>
                <div className="input-group">
                  <input id="unitp" className={fieldClass('unit', errors.unit)} inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="204" />
                  <span className="addon">сум/{t.unit}</span>
                </div>
              </Field>
            )}
            <Field label="Стоимость доставки" error={errors.delivery} htmlFor="delivery" hint="До склада заказчика; 0 — если бесплатно">
              <div className="input-group">
                <input id="delivery" className={fieldClass('delivery', errors.delivery)} inputMode="numeric" value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="200 000" />
                <span className="addon">сум</span>
              </div>
            </Field>
            <Field label="Срок поставки" error={errors.days} htmlFor="days" hint={tooSlow ? undefined : `Требование заказчика: не более ${days(t.deliveryDays)}`}>
              <div className="input-group">
                <input id="days" className={fieldClass('days', errors.days)} inputMode="numeric" value={dDays} onChange={(e) => setDDays(e.target.value)} placeholder="5" />
                <span className="addon">дней</span>
              </div>
              {tooSlow && <span className="err">Больше {days(t.deliveryDays)} — ставка не пройдёт фильтр ТЗ</span>}
            </Field>
            <div className="field">
              <span className="label">Полная стоимость ставки</span>
              <div className="card-soft" style={{ padding: '10px 12px' }}>
                <b className="num" style={{ fontSize: 18 }}>
                  {Number.isFinite(total) ? formatMoney(total) : '—'}
                </b>
                <div className="small muted">товар + доставка — по ней ранжируются ставки</div>
              </div>
            </div>

            <div className="field full">
              <span className="label">Подтвердите обязательные требования</span>
              <div className="checks">
                {t.requirements.map((r) => (
                  <label key={r.id} className={`check${reqs[r.id] ? ' on' : ''}`}>
                    <input type="checkbox" checked={Boolean(reqs[r.id])} onChange={(e) => setReqs({ ...reqs, [r.id]: e.target.checked })} />
                    <span>{r.text}</span>
                    {mentioned.has(r.id) && <span className="tag pill ok">упомянуто в КП</span>}
                  </label>
                ))}
              </div>
              {unconfirmed.length > 0 && (
                <span className="hint" style={{ color: 'var(--warn)' }}>
                  Не подтверждено: {unconfirmed.length}. Такая ставка будет отмечена и исключена из рейтинга.
                </span>
              )}
            </div>

            <Field label="Комментарий" full htmlFor="comment">
              <textarea id="comment" className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Условия оплаты, гарантии, отгрузка…" />
            </Field>
          </div>

          <div className="form-actions">
            <button className="btn lg" type="submit">
              🔒 {existing ? 'Обновить ставку' : 'Отправить закрытую ставку'}
            </button>
            {filledBy !== 'manual' && <SourceBadge source={filledBy} />}
          </div>
        </form>

        <div className="stack">
          <div className="card ai-box">
            <h2>
              <span className="ai-badge">AI</span> AI-разбор КП
            </h2>
            <p className="muted small" style={{ margin: '6px 0 12px' }}>
              Вставьте коммерческое предложение как есть — сообщение из Telegram, текст письма или скопированный из PDF текст. Мы извлечём цену, доставку и срок и
              заполним форму. Проверьте поля перед отправкой.
            </p>
            <textarea
              className="input"
              rows={5}
              value={offer}
              onChange={(e) => setOffer(e.target.value)}
              placeholder="Стаканы 250мл 50000шт по 204 сум, доставка 200 тыс, 5 дней"
              aria-label="Текст коммерческого предложения"
            />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn" type="button" onClick={runParse} disabled={!offer.trim() || parsing}>
                {parsing ? 'Claude разбирает…' : '✦ Разобрать КП'}
              </button>
              <button className="btn ghost" type="button" onClick={() => setOffer(exampleOffer(t, sid))}>
                Вставить пример КП
              </button>
              <span style={{ marginLeft: 'auto' }}>
                {!parsed && <SourceBadge source={apiKey ? 'claude' : 'rules'} />}
              </span>
            </div>

            {parsed && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {parsed.fallbackReason && <div className="banner warn small">Claude недоступен ({parsed.fallbackReason}) — использован офлайн-разбор.</div>}
                <div className="row between">
                  <b className="small">Извлечено</b>
                  <SourceBadge source={parsed.source} />
                </div>
                <div className="sum-rows small">
                  <div className="r">
                    <span>Цена за партию</span>
                    <b className="num">{parsed.r.goodsTotal !== null ? formatMoney(parsed.r.goodsTotal) : '—'}</b>
                  </div>
                  <div className="r">
                    <span>Цена за {t.unit}</span>
                    <b className="num">{parsed.r.unitPrice !== null ? `${groupDigits(parsed.r.unitPrice)} сум` : '—'}</b>
                  </div>
                  <div className="r">
                    <span>Доставка</span>
                    <b className="num">{parsed.r.deliveryCost !== null ? formatMoney(parsed.r.deliveryCost) : '—'}</b>
                  </div>
                  <div className="r">
                    <span>Срок</span>
                    <b>{parsed.r.deliveryDays !== null ? days(parsed.r.deliveryDays) : '—'}</b>
                  </div>
                  {parsed.r.goodsTotal !== null && parsed.r.deliveryCost !== null && (
                    <div className="r total">
                      <span>Итого</span>
                      <b className="num">{formatCompact(parsed.r.goodsTotal + parsed.r.deliveryCost)} сум</b>
                    </div>
                  )}
                </div>
                {parsed.r.found.length > 0 && (
                  <details>
                    <summary className="small muted" style={{ cursor: 'pointer' }}>
                      Как извлечено ({parsed.r.found.length})
                    </summary>
                    <ul className="extract" style={{ marginTop: 6 }}>
                      {parsed.r.found.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {parsed.r.warnings.length > 0 && (
                  <ul className="warn-list">
                    {parsed.r.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
                <div className="banner ok small">Поля формы заполнены и подсвечены. Требования, упомянутые в КП, отмечены — проверьте всё перед отправкой.</div>
              </div>
            )}
          </div>
          <div className="card-soft small muted">
            Комиссия TenderX — 1% от суммы сделки, только если заказчик выберет вашу ставку. Подача ставки бесплатна.
          </div>
        </div>
      </div>
    </div>
  );
}
