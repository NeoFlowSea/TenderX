/** Мини-роутер на location.hash: у каждого экрана свой прямой URL (#/tender/t001/compare). */
import { useSyncExternalStore } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean), query: new URLSearchParams(q) };
}

let currentHash = window.location.hash;
let current = parse(currentHash);
const listeners = new Set<() => void>();

/** Обновить маршрут из location.hash и уведомить подписчиков (снимок меняется только здесь). */
function sync() {
  if (currentHash === window.location.hash) return;
  currentHash = window.location.hash;
  current = parse(currentHash);
  listeners.forEach((l) => l());
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', sync);

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const getSnapshot = () => current;

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export function navigate(path: string) {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
  sync(); // не ждём асинхронного hashchange — все подписчики обновляются в одном проходе
}
