import type { ReactNode } from 'react';
import { STATUS_LABEL } from '../lib/analysis';
import { formatCountdown } from '../lib/format';
import { useNow } from '../hooks';
import type { TenderStatus } from '../types';

export function StatusPill({ status }: { status: TenderStatus }) {
  return <span className={`pill ${status}`}>{STATUS_LABEL[status]}</span>;
}

export function Countdown({ deadline }: { deadline: string }) {
  const now = useNow(1000);
  return <span className="num">{formatCountdown(new Date(deadline).getTime() - now)}</span>;
}

export function SourceBadge({ source }: { source: 'rules' | 'claude' }) {
  return source === 'claude' ? (
    <span className="src claude" title="Ответ сгенерирован моделью Claude по вашему API-ключу">✦ AI (Claude)</span>
  ) : (
    <span className="src rules" title="Детерминированные правила, без нейросети и без интернета">⚙ офлайн-разбор (правила)</span>
  );
}

export function Field({
  label,
  hint,
  error,
  full,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  full?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className={`field${full ? ' full' : ''}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function NotFound({ what = 'Страница' }: { what?: string }) {
  return (
    <div className="container">
      <div className="card empty">
        <h2>{what} не найдена</h2>
        <p style={{ marginTop: 8 }}>
          <a href="#/">← К списку тендеров</a>
        </p>
      </div>
    </div>
  );
}
