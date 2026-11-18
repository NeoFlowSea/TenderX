import { useEffect, useState } from 'react';
import { maskKey, setApiKey, useApiKey } from '../ai/settings';
import { CLAUDE_MODEL } from '../ai/claude';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const current = useApiKey();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="settings-title">Настройки AI</h2>
        <p className="muted small">
          Без ключа приложение работает полностью офлайн: разбор КП и объяснение строятся по правилам (метка «офлайн-разбор (правила)»).
          С ключом Anthropic разбор КП и текст «Почему?» формирует Claude (метка «AI (Claude)»). Расчёты, рейтинг и экономия всегда
          считаются кодом, а не нейросетью.
        </p>

        <div className="card-soft" style={{ marginTop: 14 }}>
          <div className="row between">
            <span className="label">Статус</span>
            {current ? <span className="pill ok">Ключ сохранён: {maskKey(current)}</span> : <span className="pill grey">Ключ не задан</span>}
          </div>
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="label">Модель</span>
            <code className="small">{CLAUDE_MODEL}</code>
          </div>
        </div>

        <form
          style={{ marginTop: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) {
              setApiKey(draft);
              setDraft('');
            }
          }}
        >
          <div className="field">
            <label htmlFor="api-key">Anthropic API key</label>
            <input
              id="api-key"
              className="input"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <span className="hint">
              Ключ хранится только в localStorage этого браузера и отправляется напрямую в api.anthropic.com. Он не попадает в код или
              репозиторий. Не сохраняйте ключ на чужих и общих компьютерах.
            </span>
          </div>
          <div className="form-actions">
            <button className="btn" type="submit" disabled={!draft.trim()}>
              Сохранить ключ
            </button>
            {current && (
              <button className="btn danger" type="button" onClick={() => setApiKey('')}>
                Удалить ключ
              </button>
            )}
            <span className="spacer" style={{ flex: 1 }} />
            <button className="btn secondary" type="button" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
