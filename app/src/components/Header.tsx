import { useState } from 'react';
import { actions, useAppState } from '../store';
import { useApiKey } from '../ai/settings';
import { navigate, useRoute } from '../router';
import type { SupplierId } from '../types';
import { SettingsModal } from './SettingsModal';

export function Header() {
  const s = useAppState();
  const apiKey = useApiKey();
  const route = useRoute();
  const [settings, setSettings] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const first = route.path[0] ?? '';

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="logo" href="#/">
          Tender<span>X</span>
          <small>MVP · Кейс №19</small>
        </a>
        <nav className="nav">
          <a href="#/" className={first === '' || first === 'tender' ? 'active' : ''}>
            Тендеры
          </a>
          {s.role === 'buyer' && (
            <a href="#/new" className={first === 'new' ? 'active' : ''}>
              + Новая закупка
            </a>
          )}
        </nav>
        <div className="spacer" />
        <div className="top-controls">
          <div className="seg" role="group" aria-label="Роль">
            <button className={s.role === 'buyer' ? 'on' : ''} onClick={() => actions.setRole('buyer')}>
              Заказчик
            </button>
            <button
              className={s.role === 'supplier' ? 'on' : ''}
              onClick={() => {
                actions.setRole('supplier');
                if (first === 'new') navigate('/');
              }}
            >
              Поставщик
            </button>
          </div>
          {s.role === 'supplier' && (
            <div className="seg" role="group" aria-label="Демо-поставщик">
              {(['A', 'B', 'C'] as SupplierId[]).map((id) => (
                <button key={id} className={s.supplierId === id ? 'on' : ''} onClick={() => {
                    actions.setSupplier(id);
                    if (route.path[0] === 'tender' && route.path[2] === 'bid') navigate(`/tender/${route.path[1]}/bid?as=${id}`);
                  }}
                  title={`Войти как Поставщик ${id}`}>
                  {id}
                </button>
              ))}
            </div>
          )}
          <button className="chip-btn" onClick={() => setSettings(true)} title="Настройки AI">
            <i className={`dot${apiKey ? ' on' : ''}`} />
            {apiKey ? 'AI: Claude' : 'AI: офлайн (правила)'}
          </button>
          {confirmReset ? (
            <span className="row" style={{ gap: 6 }}>
              <span className="who">Сбросить?</span>
              <button
                className="chip-btn"
                onClick={() => {
                  actions.resetDemo();
                  setConfirmReset(false);
                  navigate('/');
                }}
              >
                Да
              </button>
              <button className="chip-btn" onClick={() => setConfirmReset(false)}>
                Нет
              </button>
            </span>
          ) : (
            <button className="chip-btn" onClick={() => setConfirmReset(true)} title="Вернуть исходные демо-данные">
              ↺ Сбросить демо-данные
            </button>
          )}
        </div>
      </div>
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </header>
  );
}
