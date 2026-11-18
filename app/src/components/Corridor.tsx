import type { Analysis } from '../lib/analysis';
import { CORRIDOR_LABEL } from '../lib/analysis';
import { groupDigits } from '../lib/format';

/** Рыночный коридор цены за единицу и положение каждой ставки */
export function Corridor({ analysis }: { analysis: Analysis }) {
  const m = analysis.market;
  if (!m) {
    return <p className="muted small">Для этого товара нет демо-ориентира цены.</p>;
  }
  const prices = analysis.bids.map((b) => b.unitPrice);
  const lo = Math.min(m.low, ...prices);
  const hi = Math.max(m.high, ...prices);
  const pad = (hi - lo) * 0.15 || hi * 0.1;
  const min = lo - pad;
  const max = hi + pad;
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;

  // разводим подписи, если цены почти совпадают
  const sorted = [...analysis.bids].sort((a, b) => a.unitPrice - b.unitPrice);
  const offsets = new Map<string, number>();
  let lastPct = -100;
  let level = 0;
  for (const b of sorted) {
    const pct = ((b.unitPrice - min) / (max - min)) * 100;
    level = pct - lastPct < 9 ? level + 1 : 0;
    offsets.set(b.bid.id, level);
    lastPct = pct;
  }

  return (
    <div className="corridor">
      <div className="corr-track" style={{ marginTop: 20 + Math.max(...offsets.values(), 0) * 20 }}>
        <div className="corr-axis" />
        <div className="corr-band" style={{ left: pos(m.low), width: `calc(${pos(m.high)} - ${pos(m.low)})` }} />
        <div className="corr-band-label" style={{ left: `calc((${pos(m.low)} + ${pos(m.high)}) / 2)` }}>
          коридор {groupDigits(m.low)}–{groupDigits(m.high)}
        </div>
        {analysis.bids.map((b) => {
          const lvl = offsets.get(b.bid.id) ?? 0;
          const win = analysis.recommended === b;
          return (
            <div
              key={b.bid.id}
              className={`corr-mark${win ? ' win' : ''}${b.compliant ? '' : ' excl'}`}
              style={{ left: pos(b.unitPrice) }}
              title={`${b.supplier?.name ?? b.bid.supplierId}: ${groupDigits(Math.round(b.unitPrice))} сум/${m.unit}`}
            >
              <span className="lbl">
                {b.bid.supplierId} · {groupDigits(Math.round(b.unitPrice))}
              </span>
              <span className="stem" style={{ height: 22 + lvl * 20 }} />
            </div>
          );
        })}
      </div>
      <div className="corr-ends">
        <span>{groupDigits(Math.round(min))} сум</span>
        <span>цена товара за {m.unit}, без доставки</span>
        <span>{groupDigits(Math.round(max))} сум</span>
      </div>
      <div className="corr-legend">
        {analysis.bids.map((b) => (
          <div className="it" key={b.bid.id}>
            <span>
              {b.supplier?.name ?? b.bid.supplierId}: <b className="num">{groupDigits(Math.round(b.unitPrice))}</b>
            </span>
            <span className={`pill ${b.corridor === 'inside' ? 'ok' : b.corridor === 'above' ? 'bad' : 'warn'}`}>{b.corridor ? CORRIDOR_LABEL[b.corridor] : '—'}</span>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 12 }}>
        <span className="demo-note">
          ⚠ Иллюстративные демо-данные, не рыночная статистика. Источник: {m.source} ({m.asOf})
        </span>
      </p>
    </div>
  );
}
