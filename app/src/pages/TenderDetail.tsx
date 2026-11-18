import { actions, marketFor, useAppState } from '../store';
import { useNow } from '../hooks';
import { tenderStatus } from '../lib/analysis';
import { days, formatDateTime, formatMoney, groupDigits, plural, qty } from '../lib/format';
import { Countdown, NotFound, StatusPill } from '../components/ui';
import { navigate } from '../router';
import type { Tender } from '../types';

export function TenderHeader({ t, children }: { t: Tender; children?: React.ReactNode }) {
  const now = useNow(1000);
  const status = tenderStatus(t, now);
  return (
    <>
      <div className="crumbs">
        <a href="#/">Тендеры</a> / <a href={`#/tender/${t.id}`}>Тендер #{t.number}</a>
      </div>
      <div className="page-head">
        <div>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="kicker" style={{ margin: 0 }}>
              Тендер #{t.number}
            </span>
            <StatusPill status={status} />
          </div>
          <h1>
            {t.title} — {qty(t.quantity, t.unit)}
          </h1>
          <div className="meta" style={{ marginTop: 8, fontSize: 14 }}>
            <span>{t.buyer}</span>
            <span>📍 {t.region}</span>
            <span>🚚 поставка до {days(t.deliveryDays)}</span>
            <span>⏱ дедлайн {formatDateTime(t.closedAt && status !== 'open' ? t.closedAt : t.deadline)}</span>
          </div>
        </div>
        {children}
      </div>
    </>
  );
}

export function TenderDetail({ id }: { id: string }) {
  const s = useAppState();
  const now = useNow(1000);
  const t = s.tenders.find((x) => x.id === id);
  if (!t) return <NotFound what="Тендер" />;
  const status = tenderStatus(t, now);
  const bids = s.bids.filter((b) => b.tenderId === t.id);
  const mine = bids.find((b) => b.supplierId === s.supplierId);
  const market = marketFor(t.itemKey);

  return (
    <div className="container">
      <TenderHeader t={t} />
      <div className="grid-2">
        <div className="stack">
          <div className="card">
            <h2>Условия закупки</h2>
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Категория</dt>
              <dd>{t.category}</dd>
              <dt>Товар</dt>
              <dd>{t.title}</dd>
              <dt>Количество</dt>
              <dd>
                {qty(t.quantity, t.unit)}
              </dd>
              <dt>Регион</dt>
              <dd>{t.region}</dd>
              <dt>Срок поставки</dt>
              <dd>не более {days(t.deliveryDays)}</dd>
              <dt>Дедлайн ставок</dt>
              <dd>{formatDateTime(t.deadline)}</dd>
              {s.role === 'buyer' && (
                <>
                  <dt>Бюджет</dt>
                  <dd>{t.budget ? formatMoney(t.budget) : 'не указан'}</dd>
                </>
              )}
            </dl>
          </div>
          <div className="card">
            <h2>Обязательные требования</h2>
            <ul className="req-list" style={{ marginTop: 10 }}>
              {t.requirements.map((r) => (
                <li key={r.id}>{r.text}</li>
              ))}
              <li>Срок поставки не более {days(t.deliveryDays)}</li>
            </ul>
          </div>
        </div>

        <div className="stack">
          {status === 'open' && (
            <div className="banner lock">
              <span>🔒</span>
              <span className="grow">
                <b>Цены скрыты до дедлайна.</b> Подано {bids.length} {plural(bids.length, ['ставка', 'ставки', 'ставок'])}.
              </span>
              <span className="cd">
                <Countdown deadline={t.deadline} />
              </span>
            </div>
          )}

          {s.role === 'buyer' ? (
            <div className="card">
              {status === 'open' ? (
                <>
                  <h2>Приём ставок идёт</h2>
                  <p className="muted small" style={{ margin: '6px 0 14px' }}>
                    Сравнение откроется автоматически после дедлайна. Для демо можно завершить приём прямо сейчас.
                  </p>
                  <button
                    className="btn dark block"
                    disabled={bids.length === 0}
                    onClick={() => {
                      actions.closeBidding(t.id);
                      navigate(`/tender/${t.id}/compare`);
                    }}
                  >
                    Завершить приём ставок (демо)
                  </button>
                  {bids.length === 0 && <p className="muted small" style={{ marginTop: 8 }}>Пока нет ни одной ставки — переключитесь на роль «Поставщик» и подайте ставку.</p>}
                </>
              ) : status === 'opened' ? (
                <>
                  <h2>Ставки вскрыты</h2>
                  <p className="muted small" style={{ margin: '6px 0 14px' }}>
                    {bids.length} {plural(bids.length, ['ставка', 'ставки', 'ставок'])} — сравните полную стоимость и выберите поставщика.
                  </p>
                  <a className="btn lg block" href={`#/tender/${t.id}/compare`}>
                    Вскрытие и сравнение →
                  </a>
                </>
              ) : (
                <>
                  <h2>Сделка подтверждена</h2>
                  <a className="btn lg block" href={`#/tender/${t.id}/deal`} style={{ marginTop: 12 }}>
                    Открыть сделку →
                  </a>
                </>
              )}
            </div>
          ) : (
            <div className="card">
              <h2>Поставщик {s.supplierId}</h2>
              {status === 'open' ? (
                <>
                  <p className="muted small" style={{ margin: '6px 0 14px' }}>
                    {mine ? 'Ваша ставка принята. До дедлайна её можно изменить.' : 'Вы ещё не подали ставку.'}
                  </p>
                  <a className="btn lg block" href={`#/tender/${t.id}/bid`}>
                    {mine ? 'Изменить ставку' : 'Подать закрытую ставку'}
                  </a>
                </>
              ) : (
                <p className="muted small" style={{ marginTop: 6 }}>
                  Приём ставок завершён.{' '}
                  {t.deal ? (t.deal.supplierId === s.supplierId ? '🎉 Заказчик выбрал вашу ставку.' : 'Заказчик выбрал другого поставщика.') : 'Заказчик сравнивает предложения.'}
                </p>
              )}
            </div>
          )}

          {market && s.role === 'buyer' && (
            <div className="card-soft small">
              <b>Демо-ориентир цены:</b> {groupDigits(market.low)}–{groupDigits(market.high)} сум/{market.unit} (товар без доставки).
              <div className="muted" style={{ marginTop: 4 }}>Источник: {market.source}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
