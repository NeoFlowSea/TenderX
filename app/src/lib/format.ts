/** Форматирование чисел и денег по-русски. Чистые функции без зависимостей от локали браузера. */

const NBSP = ' ';

/** 10400000 → "10 400 000" (разделитель — неразрывный пробел) */
export function groupDigits(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.round(Math.abs(n));
  return sign + String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 10400000 → "10 400 000 сум" */
export function formatMoney(n: number): string {
  return `${groupDigits(n)}${NBSP}сум`;
}

/** Десятичное число с запятой: 10.4 → "10,4" */
export function decimal(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',');
}

/** Всегда в миллионах: 300000 → "0,3 млн", 10400000 → "10,4 млн" */
export function formatMln(n: number, digits = 1): string {
  return `${decimal(n / 1_000_000, digits)}${NBSP}млн`;
}

/**
 * Компактная запись без потери точности для демо-сумм:
 * 10 400 000 → "10,4 млн", 11 590 000 → "11,59 млн", 300 000 → "0,3 млн", 150 000 → "150 тыс".
 */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return formatMln(n, abs % 100_000 === 0 ? 1 : 2);
  if (abs >= 1_000 && abs % 100_000 === 0) return formatMln(n, 1);
  return formatShort(n);
}

/** Короткая запись: ≥1 млн → "10,4 млн"; ≥1000 → "200 тыс"; иначе число. */
export function formatShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return formatMln(n);
  if (abs >= 1_000) {
    const t = n / 1000;
    return `${Number.isInteger(t) ? groupDigits(t) : decimal(t)}${NBSP}тыс`;
  }
  return groupDigits(n);
}

/** 7.9646 → "8,0%" */
export function formatPct(p: number, digits = 1): string {
  return `${decimal(p, digits)}%`;
}

/** Склонение: plural(5, ['день','дня','дней']) → "дней" */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

const UNIT_FORMS: Record<string, [string, string, string]> = {
  пачка: ['пачка', 'пачки', 'пачек'],
  упаковка: ['упаковка', 'упаковки', 'упаковок'],
  рулон: ['рулон', 'рулона', 'рулонов'],
};

/** Количество с единицей: qty(2000, 'пачка') → "2 000 пачек", qty(50000, 'шт') → "50 000 шт" */
export function qty(n: number, unit: string): string {
  const forms = UNIT_FORMS[unit];
  return `${groupDigits(n)}${NBSP}${forms ? plural(n, forms) : unit}`;
}

export function days(n: number): string {
  return `${n}${NBSP}${plural(n, ['день', 'дня', 'дней'])}`;
}

/** Обратный отсчёт: "1 д 4 ч", "3 ч 12 мин", "45 с" */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'дедлайн прошёл';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}${NBSP}д ${h}${NBSP}ч ${m}${NBSP}мин`;
  if (h > 0) return `${h}${NBSP}ч ${m}${NBSP}мин`;
  if (m > 0) return `${m}${NBSP}мин ${s}${NBSP}с`;
  return `${s}${NBSP}с`;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** "20 ноября, 18:00" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}
