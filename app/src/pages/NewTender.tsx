import { useMemo, useState } from 'react';
import { actions, MARKET, useAppState } from '../store';
import { navigate } from '../router';
import { Field } from '../components/ui';
import { groupDigits } from '../lib/format';
import type { Requirement } from '../types';

const CATEGORY = 'Упаковка и расходники HoReCa';
const REGIONS = ['Ташкент', 'Ташкентская обл.', 'Самарканд', 'Бухара', 'Андижан', 'Фергана', 'Наманган', 'Нукус'];
const UNITS = ['шт', 'пачка', 'упаковка', 'рулон', 'кг'];
const PRESET_REQS = [
  'Сертификат соответствия для контакта с пищевыми продуктами',
  'Подходят для горячих напитков (до 90 °C)',
  'Доставка до склада заказчика',
  'Отсрочка оплаты не менее 7 дней',
  'Брендирование логотипом заказчика',
];

function defaultDeadline(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  d.setHours(18, 0, 0, 0);
  return toLocalInput(d);
}

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "50 000" / "50000" → 50000 */
function toNumber(s: string): number {
  const v = Number(s.replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
}

type Errors = Partial<Record<'item' | 'customItem' | 'quantity' | 'deliveryDays' | 'deadline' | 'requirements' | 'budget' | 'buyer', string>>;

export function NewTender() {
  const s = useAppState();
  const [itemKey, setItemKey] = useState('cups_250');
  const [customItem, setCustomItem] = useState('');
  const [quantity, setQuantity] = useState('50 000');
  const [unit, setUnit] = useState('шт');
  const [region, setRegion] = useState('Ташкент');
  const [buyer, setBuyer] = useState('Сеть кофеен');
  const [deliveryDays, setDeliveryDays] = useState('7');
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(PRESET_REQS.slice(0, 2)));
  const [custom, setCustom] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState('');
  const [budget, setBudget] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState(false);

  const market = MARKET.find((m) => m.itemKey === itemKey);

  const validate = useMemo(
    () => (): Errors => {
      const e: Errors = {};
      if (itemKey === 'other' && customItem.trim().length < 3) e.customItem = 'Опишите товар (минимум 3 символа)';
      const q = toNumber(quantity);
      if (!Number.isInteger(q) || q <= 0) e.quantity = 'Укажите целое количество больше нуля';
      else if (q > 10_000_000) e.quantity = 'Слишком большой объём для одной закупки';
      const dd = toNumber(deliveryDays);
      if (!Number.isInteger(dd) || dd < 1 || dd > 90) e.deliveryDays = 'Срок поставки — от 1 до 90 дней';
      const dl = new Date(deadline).getTime();
      if (!deadline || Number.isNaN(dl)) e.deadline = 'Укажите дату и время';
      else if (dl < Date.now() + 10 * 60_000) e.deadline = 'Дедлайн должен быть минимум через 10 минут';
      if (checked.size + custom.length === 0) e.requirements = 'Добавьте хотя бы одно обязательное требование';
      if (budget.trim()) {
        const b = toNumber(budget);
        if (!Number.isFinite(b) || b <= 0) e.budget = 'Бюджет — положительное число или оставьте пустым';
      }
      if (buyer.trim().length < 2) e.buyer = 'Укажите заказчика';
      return e;
    },
    [itemKey, customItem, quantity, deliveryDays, deadline, checked, custom, budget, buyer],
  );

  const liveErrors = touched ? validate() : errors;

  if (s.role !== 'buyer') {
    return (
      <div className="container">
        <div className="card empty">
          <h2>Создавать закупки может только заказчик</h2>
          <p style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => actions.setRole('buyer')}>
              Переключиться на «Заказчик»
            </button>
          </p>
        </div>
      </div>
    );
  }

  function toggle(req: string) {
    const next = new Set(checked);
    if (next.has(req)) next.delete(req);
    else next.add(req);
    setChecked(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const reqTexts = [...PRESET_REQS.filter((r) => checked.has(r)), ...custom];
    const requirements: Requirement[] = reqTexts.map((text, i) => ({ id: `r${i + 1}`, text }));
    const title = itemKey === 'other' ? customItem.trim() : (market?.name ?? customItem);
    const t = actions.createTender({
      title,
      category: CATEGORY,
      itemKey,
      quantity: toNumber(quantity),
      unit,
      region,
      buyer: buyer.trim(),
      deliveryDays: toNumber(deliveryDays),
      deadline: new Date(deadline).toISOString(),
      requirements,
      budget: budget.trim() ? toNumber(budget) : undefined,
    });
    navigate(`/tender/${t.id}`);
  }

  return (
    <div className="container">
      <div className="crumbs">
        <a href="#/">Тендеры</a> / Новая закупка
      </div>
      <div className="page-head">
        <div>
          <div className="kicker">Заказчик</div>
          <h1>Новая закупка</h1>
          <p className="lead">Опишите, что нужно купить. Поставщики увидят запрос и подадут закрытые ставки до дедлайна.</p>
        </div>
      </div>

      <form className="grid-2" onSubmit={submit} noValidate>
        <div className="card">
          <div className="form-grid">
            <Field label="Категория" full hint="В MVP — одна вертикаль">
              <select className="input" value={CATEGORY} disabled>
                <option>{CATEGORY}</option>
              </select>
            </Field>
            <Field label="Товар" full htmlFor="item" hint={market ? `Для товара есть демо-ориентир цены: ${groupDigits(market.low)}–${groupDigits(market.high)} сум/${market.unit}` : 'Для «Другое» рыночного ориентира нет'}>
              <select
                id="item"
                className="input"
                value={itemKey}
                onChange={(e) => {
                  setItemKey(e.target.value);
                  const m = MARKET.find((x) => x.itemKey === e.target.value);
                  if (m) setUnit(m.unit);
                }}
              >
                {MARKET.map((m) => (
                  <option key={m.itemKey} value={m.itemKey}>
                    {m.name}
                  </option>
                ))}
                <option value="other">Другое (указать)</option>
              </select>
            </Field>
            {itemKey === 'other' && (
              <Field label="Название товара" full error={liveErrors.customItem} htmlFor="custom-item">
                <input id="custom-item" className={`input${liveErrors.customItem ? ' invalid' : ''}`} value={customItem} onChange={(e) => setCustomItem(e.target.value)} placeholder="Например: Пищевая плёнка 30 см" />
              </Field>
            )}
            <Field label="Количество" error={liveErrors.quantity} htmlFor="qty">
              <input id="qty" className={`input${liveErrors.quantity ? ' invalid' : ''}`} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <Field label="Единица" htmlFor="unit">
              <select id="unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </Field>
            <Field label="Регион поставки" htmlFor="region">
              <select id="region" className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
                {REGIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Срок поставки, не более" error={liveErrors.deliveryDays} htmlFor="dd">
              <div className="input-group">
                <input id="dd" className={`input${liveErrors.deliveryDays ? ' invalid' : ''}`} inputMode="numeric" value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} />
                <span className="addon">дней</span>
              </div>
            </Field>
            <Field label="Дедлайн приёма ставок" error={liveErrors.deadline} htmlFor="deadline">
              <input id="deadline" type="datetime-local" className={`input${liveErrors.deadline ? ' invalid' : ''}`} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Field>
            <Field label="Заказчик" error={liveErrors.buyer} htmlFor="buyer">
              <input id="buyer" className={`input${liveErrors.buyer ? ' invalid' : ''}`} value={buyer} onChange={(e) => setBuyer(e.target.value)} />
            </Field>
            <Field label="Бюджет (необязательно)" error={liveErrors.budget} hint="Поставщики бюджет не видят" htmlFor="budget">
              <div className="input-group">
                <input id="budget" className={`input${liveErrors.budget ? ' invalid' : ''}`} inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="например, 11 500 000" />
                <span className="addon">сум</span>
              </div>
            </Field>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>Обязательные требования</h2>
            <p className="muted small" style={{ margin: '4px 0 12px' }}>
              Поставщик должен подтвердить каждое. Ставки без подтверждения отмечаются и исключаются из рейтинга.
            </p>
            <div className="checks">
              {PRESET_REQS.map((r) => (
                <label key={r} className={`check${checked.has(r) ? ' on' : ''}`}>
                  <input type="checkbox" checked={checked.has(r)} onChange={() => toggle(r)} />
                  <span>{r}</span>
                </label>
              ))}
              {custom.map((r, i) => (
                <label key={`c${i}`} className="check on">
                  <input type="checkbox" checked onChange={() => setCustom(custom.filter((_, j) => j !== i))} />
                  <span>{r}</span>
                  <span className="tag pill grey">своё</span>
                </label>
              ))}
            </div>
            <div className="add-row" style={{ marginTop: 10 }}>
              <input
                className="input"
                placeholder="Своё требование, например «Плотность картона от 280 г/м²»"
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (customDraft.trim()) {
                      setCustom([...custom, customDraft.trim()]);
                      setCustomDraft('');
                    }
                  }
                }}
              />
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  if (customDraft.trim()) {
                    setCustom([...custom, customDraft.trim()]);
                    setCustomDraft('');
                  }
                }}
              >
                Добавить
              </button>
            </div>
            {liveErrors.requirements && <p className="err small" style={{ color: 'var(--bad)', marginTop: 8 }}>{liveErrors.requirements}</p>}
          </div>
          <div className="card">
            <button className="btn lg block" type="submit">
              Опубликовать тендер
            </button>
            <p className="muted small" style={{ marginTop: 10 }}>
              Для заказчика площадка бесплатна. Поставщик платит 1% только после подтверждённой сделки.
            </p>
            {touched && Object.keys(liveErrors).length > 0 && (
              <div className="banner bad" style={{ marginTop: 12 }}>
                Исправьте поля, отмеченные красным.
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
