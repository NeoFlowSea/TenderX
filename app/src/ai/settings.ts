/**
 * Ключ Anthropic API пользователя. Хранится ТОЛЬКО в localStorage этого браузера,
 * никогда не попадает в код, сборку или репозиторий.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'tenderx.anthropicApiKey';
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

let value = read();

export function getApiKey(): string {
  return value;
}

export function setApiKey(k: string) {
  value = k.trim();
  try {
    if (value) localStorage.setItem(KEY, value);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useApiKey(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => value,
  );
}

export function maskKey(k: string): string {
  return k.length > 12 ? `${k.slice(0, 7)}…${k.slice(-4)}` : '••••';
}
