import { useEffect, useMemo, useState } from 'react';
import { actions, marketFor, useAppState } from '../store';
import { useNow } from '../hooks';
import { analyzeTender, CORRIDOR_LABEL, tenderStatus, type AnalyzedBid } from '../lib/analysis';
import { explainRecommendation, type Explanation } from '../lib/explain';
import { days, formatCompact, formatMoney, formatPct, groupDigits, plural } from '../lib/format';
import { Countdown, NotFound, SourceBadge } from '../components/ui';
import { Corridor } from '../components/Corridor';
import { TenderHeader } from './TenderDetail';
import { navigate } from '../router';
import { getApiKey, useApiKey } from '../ai/settings';
import { ClaudeError, explainWithClaude } from '../ai/claude';

const ICON = { ok: '✓', warn: '!', bad: '✕', info: 'i' } as const;

export function Compare({ id }: { id: string }) {
  const s = useAppState();
  const now = useNow(1000);
  const apiKey = useApiKey();
  const t = s.tenders.find((x) => x.id === id);

  useEffect(() => {
    actions.setRole('buyer');
  }, []);

  const analysis = useMemo(() => (t ? analyzeTender(t, s.bids, marketFor(t.itemKey), s.suppliers) : null), [t, s.bids, s.suppliers]);
  const rulesExpl = useMemo(() => (t && analysis ? explainRecommendation(analysis, t) : null), [analysis, t]);
  const [aiExpl, setAiExpl] = useState<(Explanation & { unknownNumbers: string[] }) | null>(null);
  const [aiState, setAiState] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const [choosing, setChoosing] = useState<string | null>(null);

  useEffect(() => {
    setAiExpl(null);
  }, [analysis]);

  if (!t || !analysis || !rulesExpl) return <NotFound what="Тендер" />;
  const status = tenderStatus(t, now);
  const bidsCount = s.bids.filter((b) => b.tenderId === t.id).length;

  if (status === 'open') {
    return (
      <div className="container">
        <TenderHeader t={t} />
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="banner lock" style={{ marginBottom: 16 }}>
            <span>🔒</span>
            <span className="grow">
              <b>Вскрытие доступно только после дедлайна.</b> Подано {bidsCount} {plural(bidsCount, ['ставка', 'ставки', 'ставок'])}, цены скрыты.
            </span>
            <span className="cd">
              <Countdown deadline={t.deadline} />
            </span>
          </div>
          <p className="muted small" style={{ marginBottom: 14 }}>
            Закрытые ставки защищают от сговора и «подглядывания»: никто, включая заказчика, не видит цены до окончания приёма.
          </p>
          <button
            className="btn dark lg"
            disabled={bidsCount === 0}
            onClick={() => {
              actions.closeBidding(t.id);
            }}
          >
            Завершить приём ставок (демо)
          </button>
        </div>
      </div>
    );
  }

  const expl = aiExpl ?? rulesExpl;
  const best = analysis.recommended;
  const name = (a: AnalyzedBid) => a.supplier?.name ?? `Поставщик ${a.bid.supplierId}`;

  async function askClaude() {
    if (!t || !analysis) return;
    setAiState({ loading: true });
    try {
      const r = await explainWithClaude(getApiKey(), analysis, t);
      setAiExpl(r);
      setAiState({ loading: false });
    } catch (e) {
      setAiState({ loading: false, error: e instanceof ClaudeError ? e.message : 'Ошибка вызова Claude' });
    }
  }

  return (
    <div className="container">
      <TenderHeader t={t}>
        <span className="pill opened" style={{ fontSize: 13, padding: '6px 12px' }}>
          Вскрыт · {analysis.bids.length} {plural(analysis.bids.length, ['ставка', 'ставки', 'ставок'])}
        </span>
      </TenderHeader>

      {t.deal && (
        <div className="banner ok" style={{ marginBottom: 16 }}>
          <span className="grow">
            ✓ <b>Сделка подтверждена:</b> {s.suppliers.find((x) => x.id === t.deal!.supplierId)?.name} · {formatMoney(t.deal.total)}
          </span>
          <a className="btn sm" href={`#/tender/${t.id}/deal`}>
            Открыть сделку →
          </a>
        </div>
      )}

      <div className="grid-2 wide">
        <div className="stack">
          <div className="card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <h2>Вскрытие и сравнение</h2>
              <span className="small muted">Ранжирование по полной стоимости (товар + доставка)</span>
            </div>
            <div className="table-wrap">
              <table className="bids">
                <thead>
                  <tr>
                    <th>Поставщик</th>
                    <th>Товар</th>
                    <th>Доставка</th>
                    <th>Итого (полная стоимость)</th>
                    <th className="c">Срок</th>
                    <th className="c">Соответствие ТЗ</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.bids.map((a) => {
                    const win = a === best;
                    const isDeal = t.deal?.bidId === a.bid.id;
                    return (
                      <tr key={a.bid.id} className={win ? 'win' : a.compliant ? '' : 'excluded'}>
                        <td className="sup">
                          <span className="rank">{a.rank ?? '—'}</span>
                          <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                            <b>
                              {name(a)} {win && <span className="pill ai">AI ★</span>}
                            </b>
                            <small>
                              {a.supplier?.city}
                              {a.bid.filledBy === 'rules' || a.bid.filledBy === 'claude' ? ' · из КП' : ''}
                            </small>
                          </span>
                        </td>
                        <td className="num">
                          {formatCompact(a.bid.goodsPrice)}
                          <div className="small muted">{groupDigits(Math.round(a.unitPrice))} сум/{t.unit}</div>
                        </td>
                        <td className={`num${analysis.cheapestGoods === a && !win && a.compliant ? ' hi' : ''}`}>{formatCompact(a.bid.deliveryCost)}</td>
                        <td className="num total">
                          {formatCompact(a.fullCost)}
                          {a.deltaVsBest ? <div className="small muted">+{formatCompact(a.deltaVsBest)}</div> : null}
                        </td>
                        <td className="c">{days(a.bid.deliveryDays)}</td>
                        <td className={`c${a.compliant ? '' : ' why'}`}>
                          {a.compliant ? (
                            <span className="y" title="Все требования подтверждены">✓</span>
                          ) : (
                            <span title={a.failures.join('; ')}>
                              <span className="n">✕</span>
                              <div className="small">исключён</div>
                            </span>
                          )}
                          {isDeal && (
                            <div>
                              <span className="pill deal">Сделка</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {analysis.excluded.length > 0 && (
              <div className="banner bad small" style={{ marginTop: 12 }}>
                <span>
                  Исключены из рейтинга (не прошли обязательные требования):{' '}
                  {analysis.excluded.map((e) => `${name(e)} — ${e.failures.join('; ')}`).join(' · ')}
                </span>
              </div>
            )}

            {!t.deal && best && (
              <div style={{ marginTop: 16 }}>
                {choosing ? (
                  (() => {
                    const c = analysis.bids.find((b) => b.bid.id === choosing)!;
                    return (
                      <div className="confirm-box">
                        <b>
                          Подтвердить выбор: {name(c)} — {formatMoney(c.fullCost)} с доставкой, срок {days(c.bid.deliveryDays)}?
                        </b>
                        {c !== best && <span className="small" style={{ color: 'var(--warn)' }}>Это не рекомендованный вариант: дороже на {formatMoney(c.deltaVsBest ?? 0)}. Решение за вами.</span>}
                        <span className="small muted">Поставщик получит заказ и оплатит комиссию платформы 1% ({formatMoney(Math.round(c.fullCost * 0.01))}). Для вас — бесплатно.</span>
                        <div className="row">
                          <button
                            className="btn"
                            onClick={() => {
                              actions.chooseSupplier(t.id, c.bid.id);
                              navigate(`/tender/${t.id}/deal`);
                            }}
                          >
                            Подтвердить сделку
                          </button>
                          <button className="btn secondary" onClick={() => setChoosing(null)}>
                            Отмена
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <div className="row between">
                    <div className="stack" style={{ gap: 6 }}>
                      <span className="small muted">Рекомендация — подсказка. Финальное решение принимает заказчик.</span>
                      {analysis.ranked.length > 1 && (
                        <div className="row" style={{ gap: 6 }}>
                          <span className="small muted">Выбрать другого:</span>
                          {analysis.ranked
                            .filter((r) => r !== best)
                            .map((r) => (
                              <button key={r.bid.id} className="btn secondary sm" onClick={() => setChoosing(r.bid.id)}>
                                {name(r)}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    <button className="btn lg" onClick={() => setChoosing(best.bid.id)}>
                      Выбрать поставщика {best.bid.supplierId}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div className="row between">
              <h2>Рыночный коридор цены</h2>
              {best?.corridor && (
                <span className={`pill ${best.corridor === 'inside' ? 'ok' : 'warn'}`}>
                  {best.bid.supplierId}: {CORRIDOR_LABEL[best.corridor]}
                </span>
              )}
            </div>
            <p className="muted small" style={{ marginTop: 4 }}>
              Где находится цена товара каждой ставки относительно ориентира: ниже / в коридоре / выше.
            </p>
            <Corridor analysis={analysis} />
          </div>
        </div>

        <div className="stack">
          <div className="why-panel">
            <div className="row between">
              <h2>{best ? `Почему ${best.bid.supplierId}?` : 'Итог'}</h2>
              <SourceBadge source={expl.source} />
            </div>
            <b style={{ fontSize: 15 }}>{expl.headline}</b>
            <ul className="points">
              {expl.points.map((p, i) => (
                <li key={i} className={p.kind}>
                  <span className="ic">{ICON[p.kind] ?? 'i'}</span>
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
            {aiExpl && aiExpl.unknownNumbers.length > 0 && (
              <div className="banner warn small">⚠ В ответе Claude есть числа, которых нет в данных тендера: {aiExpl.unknownNumbers.join(', ')}. Проверьте.</div>
            )}
            {analysis.saving && analysis.mostExpensive && (
              <div className="saving">
                <b className="num">{formatCompact(analysis.saving.abs)} сум</b>
                <span>
                  экономия — {formatPct(analysis.saving.pct)} ниже самого дорогого предложения ({name(analysis.mostExpensive)}, {formatCompact(analysis.mostExpensive.fullCost)})
                </span>
              </div>
            )}
            <div className="row">
              {apiKey ? (
                aiExpl ? (
                  <button className="btn ghost sm" onClick={() => setAiExpl(null)}>
                    Показать офлайн-объяснение
                  </button>
                ) : (
                  <button className="btn secondary sm" onClick={askClaude} disabled={aiState.loading}>
                    {aiState.loading ? 'Claude пишет объяснение…' : '✦ Объяснить с Claude'}
                  </button>
                )
              ) : (
                <span className="small muted">Объяснение построено по правилам. Добавьте ключ Claude в «AI: офлайн» в шапке, чтобы получить текст от AI.</span>
              )}
            </div>
            {aiState.error && <div className="banner warn small">Claude недоступен: {aiState.error} Показано офлайн-объяснение.</div>}
            <p className="small muted">Цифры, рейтинг и экономия посчитаны кодом по данным ставок; AI только формулирует текст.</p>
          </div>

          <div className="card">
            <h3>Обязательные требования</h3>
            <ul className="req-list small" style={{ marginTop: 8 }}>
              {t.requirements.map((r) => (
                <li key={r.id}>{r.text}</li>
              ))}
              <li>Срок поставки не более {days(t.deliveryDays)}</li>
            </ul>
            {t.budget ? (
              <p className="small" style={{ marginTop: 10 }}>
                Бюджет: <b>{formatMoney(t.budget)}</b> — {best && best.fullCost <= t.budget ? 'рекомендованная ставка в рамках бюджета ✓' : 'рекомендованная ставка выше бюджета'}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
