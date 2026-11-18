import { useEffect, useMemo } from 'react';
import { actions, marketFor, useAppState } from '../store';
import { analyzeTender, PLATFORM_FEE_RATE, tenderStatus } from '../lib/analysis';
import { useRoute } from '../router';
import { days, formatDateTime, formatCompact, formatMoney, formatPct, groupDigits, qty } from '../lib/format';
import { NotFound } from '../components/ui';

export function Deal({ id }: { id: string }) {
  const s = useAppState();
  const t = s.tenders.find((x) => x.id === id);
  const analysis = useMemo(() => (t ? analyzeTender(t, s.bids, marketFor(t.itemKey), s.suppliers) : null), [t, s.bids, s.suppliers]);
  // демо-ссылка для скриншотов/презентации: #/tender/t001/deal?choose=B сразу подтверждает выбор B
  const choose = useRoute().query.get('choose');
  const autoBid = t && !t.deal && choose ? analysis?.ranked.find((r) => r.bid.supplierId === choose) : undefined;
  useEffect(() => {
    if (t && autoBid && tenderStatus(t, Date.now()) === 'opened') actions.chooseSupplier(t.id, autoBid.bid.id);
  }, [t, autoBid]);

  if (!t || !analysis) return <NotFound what="Тендер" />;

  if (!t.deal) {
    return (
      <div className="container">
        <div className="card empty">
          <h2>Сделка ещё не подтверждена</h2>
          <p style={{ marginTop: 10 }}>
            <a className="btn" href={`#/tender/${t.id}/compare`}>
              К сравнению ставок
            </a>
          </p>
        </div>
      </div>
    );
  }

  const deal = t.deal;
  const chosen = analysis.bids.find((b) => b.bid.id === deal.bidId);
  const supplier = s.suppliers.find((x) => x.id === deal.supplierId);
  if (!chosen) return <NotFound what="Ставка" />;
  const vsMax = analysis.mostExpensive ? analysis.mostExpensive.fullCost - deal.total : 0;
  const vsMaxPct = analysis.mostExpensive ? (vsMax / analysis.mostExpensive.fullCost) * 100 : 0;
  const wasRecommended = analysis.recommended?.bid.id === deal.bidId;

  return (
    <div className="container">
      <div className="crumbs">
        <a href="#/">Тендеры</a> / <a href={`#/tender/${t.id}`}>Тендер #{t.number}</a> / Сделка
      </div>

      <section className="deal-hero">
        <div className="row between">
          <span className="pill deal">Сделка подтверждена</span>
          <span className="small" style={{ color: '#94a3b8' }}>
            {formatDateTime(deal.confirmedAt)}
          </span>
        </div>
        <h1 style={{ marginTop: 14 }}>
          {t.title} — {qty(t.quantity, t.unit)}
        </h1>
        <p style={{ marginTop: 6 }}>
          {t.buyer} · {t.region} → {supplier?.name} ({supplier?.city}){wasRecommended ? ' · выбрана рекомендация AI' : ''}
        </p>
        <div className="big num">{formatMoney(deal.total)}</div>
        <p className="small">полная стоимость закупки с доставкой</p>
        <div className="flow">
          <div className="fbox">
            <b className="num">{formatCompact(deal.total)}</b>
            <span>сумма сделки</span>
          </div>
          <div className="fbox">
            <b className="num">{formatMoney(deal.fee)}</b>
            <span>комиссия TenderX {formatPct(PLATFORM_FEE_RATE * 100, 0)} — платит поставщик</span>
          </div>
          <div className="fbox">
            <b className="num">0 сум</b>
            <span>комиссия для заказчика</span>
          </div>
        </div>
      </section>

      <div className="grid-2" style={{ marginTop: 18 }}>
        <div className="card">
          <h2>Условия сделки</h2>
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>Поставщик</dt>
            <dd>
              {supplier?.name} · {supplier?.city}
            </dd>
            <dt>Товар</dt>
            <dd className="num">
              {formatMoney(chosen.bid.goodsPrice)} ({groupDigits(Math.round(chosen.unitPrice))} сум/{t.unit})
            </dd>
            <dt>Доставка</dt>
            <dd className="num">{formatMoney(chosen.bid.deliveryCost)}</dd>
            <dt>Итого</dt>
            <dd className="num">{formatMoney(deal.total)}</dd>
            <dt>Срок поставки</dt>
            <dd>{days(chosen.bid.deliveryDays)}</dd>
            <dt>Требования ТЗ</dt>
            <dd>{chosen.compliant ? 'все подтверждены ✓' : 'есть неподтверждённые'}</dd>
            {chosen.bid.comment && (
              <>
                <dt>Комментарий</dt>
                <dd style={{ fontWeight: 400 }}>{chosen.bid.comment}</dd>
              </>
            )}
          </dl>
          {vsMax > 0 && (
            <div className="saving" style={{ marginTop: 16, background: 'var(--accent-soft)', borderColor: '#99f6e4' }}>
              <b className="num">{formatMoney(vsMax)}</b>
              <span>сэкономлено относительно самого дорогого предложения ({formatPct(vsMaxPct)})</span>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <h2>Комиссия платформы</h2>
            <div className="sum-rows" style={{ marginTop: 12 }}>
              <div className="r">
                <span>Сумма сделки</span>
                <span className="num">{formatMoney(deal.total)}</span>
              </div>
              <div className="r">
                <span>Ставка комиссии</span>
                <span>{formatPct(PLATFORM_FEE_RATE * 100, 0)}, платит поставщик</span>
              </div>
              <div className="r total">
                <span>К оплате поставщиком</span>
                <span className="num">{formatMoney(deal.fee)}</span>
              </div>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              {formatCompact(deal.total)} × 1% = {groupDigits(deal.fee)} сум. Нет сделки — нет оплаты. Для заказчика площадка бесплатна.
            </p>
          </div>
          <div className="card">
            <h2>Что дальше</h2>
            <ol className="steps" style={{ marginTop: 12 }}>
              <li className="done">Заказчик выбрал поставщика</li>
              <li className="todo">Поставщик подтверждает заказ и оплачивает комиссию 1%</li>
              <li className="todo">Поставка за {days(chosen.bid.deliveryDays)} и приёмка товара</li>
              <li className="todo">Отзыв и рейтинг поставщика — данные для следующих закупок</li>
            </ol>
          </div>
          <a className="btn secondary" href={`#/tender/${t.id}/compare`}>
            ← К сравнению ставок
          </a>
        </div>
      </div>
    </div>
  );
}
