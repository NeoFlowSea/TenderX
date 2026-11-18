import { useAppState } from '../store';
import { useNow } from '../hooks';
import { tenderStatus } from '../lib/analysis';
import { days, formatDateTime, formatCompact, plural, qty } from '../lib/format';
import { Countdown, StatusPill } from '../components/ui';
import type { Tender } from '../types';

function bidWord(n: number) {
  return `${n} ${plural(n, ['ставка', 'ставки', 'ставок'])}`;
}

export function TenderList() {
  const s = useAppState();
  const now = useNow(5000);
  const isBuyer = s.role === 'buyer';
  const tenders = [...s.tenders].sort((a, b) => {
    // заказчику сначала вскрытые (нужно решение), поставщику — открытые (можно подать ставку)
    const order = isBuyer ? ({ opened: 0, open: 1, deal: 2 } as const) : ({ open: 0, opened: 1, deal: 2 } as const);
    return order[tenderStatus(a, now)] - order[tenderStatus(b, now)] || b.createdAt.localeCompare(a.createdAt);
  });
  const openCount = s.tenders.filter((t) => tenderStatus(t, now) === 'open').length;
  const dealSum = s.tenders.reduce((sum, t) => sum + (t.deal?.total ?? 0), 0);

  return (
    <div className="container">
      <section className="hero">
        <div>
          <div className="kicker" style={{ color: '#5eead4' }}>
            Закрытые тендеры · AI-сравнение
          </div>
          <h1>
            Самая низкая цена <em>≠</em> самая выгодная закупка
          </h1>
          <p>
            {isBuyer
              ? 'Публикуйте закупку, получайте закрытые ставки поставщиков и выбирайте по полной стоимости с доставкой.'
              : `Вы вошли как Поставщик ${s.supplierId}. Подавайте закрытые ставки: цены конкурентов скрыты до дедлайна — как и ваша цена от них.`}
          </p>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <b>{openCount}</b>
            <span>{plural(openCount, ['тендер', 'тендера', 'тендеров'])} принимают ставки</span>
          </div>
          <div className="hero-stat">
            <b>{dealSum ? formatCompact(dealSum) : '—'}</b>
            <span>сделок через TenderX</span>
          </div>
          <div className="hero-stat">
            <b>0%</b>
            <span>комиссия для заказчика</span>
          </div>
        </div>
      </section>

      <div className="page-head">
        <div>
          <h1>Тендеры</h1>
          <p className="lead">Категория: Упаковка и расходники HoReCa. Количество ставок видно всем, цены — только после вскрытия.</p>
        </div>
        {isBuyer && (
          <a className="btn lg" href="#/new">
            + Новая закупка
          </a>
        )}
      </div>

      <div className="tender-grid">
        {tenders.map((t) => (
          <TenderCard key={t.id} t={t} now={now} />
        ))}
      </div>
    </div>
  );
}

function TenderCard({ t, now }: { t: Tender; now: number }) {
  const s = useAppState();
  const status = tenderStatus(t, now);
  const bids = s.bids.filter((b) => b.tenderId === t.id);
  const mine = s.role === 'supplier' ? bids.find((b) => b.supplierId === s.supplierId) : undefined;
  const dealSupplier = t.deal ? s.suppliers.find((x) => x.id === t.deal!.supplierId) : undefined;

  let target = `/tender/${t.id}`;
  let cta = 'Открыть';
  if (s.role === 'buyer') {
    if (status === 'opened') {
      target = `/tender/${t.id}/compare`;
      cta = 'Сравнить ставки →';
    } else if (status === 'deal') {
      target = `/tender/${t.id}/deal`;
      cta = 'Сделка →';
    }
  } else if (status === 'open') {
    target = `/tender/${t.id}/bid`;
    cta = mine ? 'Изменить ставку →' : 'Подать ставку →';
  }

  return (
    <a className="card tcard" href={`#${target}`}>
      <div className="top">
        <span className="no">Тендер #{t.number}</span>
        <StatusPill status={status} />
      </div>
      <div>
        <h3>{t.title}</h3>
        <div className="meta" style={{ marginTop: 6 }}>
          <span>
            {qty(t.quantity, t.unit)}
          </span>
          <span>{t.buyer}</span>
          <span>📍 {t.region}</span>
          <span>🚚 до {days(t.deliveryDays)}</span>
        </div>
      </div>
      <div className="facts">
        <div className="fact">
          <small>{status === 'open' ? 'До дедлайна' : 'Дедлайн'}</small>
          <b>{status === 'open' ? <Countdown deadline={t.deadline} /> : formatDateTime(t.closedAt ?? t.deadline)}</b>
        </div>
        <div className="fact">
          <small>Ставки</small>
          <b>
            {bidWord(bids.length)}
            {status === 'open' && <span className="muted small"> · 🔒 цены скрыты</span>}
          </b>
        </div>
      </div>
      <div className="foot">
        <span className="small muted">
          {status === 'deal' && dealSupplier
            ? `Выбран ${dealSupplier.name} · ${formatCompact(t.deal!.total)}`
            : mine
              ? '✓ Ваша ставка подана'
              : status === 'open'
                ? `Приём до ${formatDateTime(t.deadline)}`
                : 'Ставки вскрыты'}
        </span>
        <span className="btn sm">{cta}</span>
      </div>
    </a>
  );
}
