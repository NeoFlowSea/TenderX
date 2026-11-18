/**
 * Простое хранилище: состояние в localStorage, при первом заходе — сид из JSON.
 * Подписка через useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';
import seedJson from './data/seed.json';
import marketJson from './data/market_prices.json';
import { buildSeedState, type DataState, type SeedFile } from './lib/seed';
import { platformFee, fullCost } from './lib/analysis';
import type { Bid, MarketPrice, Role, SupplierId, Tender } from './types';

const KEY = 'tenderx.state.v1';

export interface AppState extends DataState {
  role: Role;
  supplierId: SupplierId;
  seededAt: string;
}

export const MARKET: MarketPrice[] = (marketJson as { items: MarketPrice[] }).items;
export const MARKET_NOTE: string = (marketJson as { _note: string })._note;

export function marketFor(itemKey: string): MarketPrice | null {
  return MARKET.find((m) => m.itemKey === itemKey) ?? null;
}

function freshState(): AppState {
  const now = new Date();
  return { ...buildSeedState(seedJson as unknown as SeedFile, now), role: 'buyer', supplierId: 'B', seededAt: now.toISOString() };
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.tenders) && Array.isArray(parsed.bids)) return parsed;
    }
  } catch {
    /* повреждённые данные — пересоздаём */
  }
  const s = freshState();
  save(s);
  return s;
}

function save(s: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* приватный режим и т.п. — работаем в памяти */
  }
}

let state: AppState = load();
const listeners = new Set<() => void>();

function set(next: AppState) {
  state = next;
  save(state);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, () => state);
}

export function getState(): AppState {
  return state;
}

// синхронизация между вкладками
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = JSON.parse(e.newValue) as AppState;
        listeners.forEach((l) => l());
      } catch {
        /* ignore */
      }
    }
  });
}

export const actions = {
  setRole(role: Role) {
    if (state.role !== role) set({ ...state, role });
  },
  setSupplier(supplierId: SupplierId) {
    set({ ...state, role: 'supplier', supplierId });
  },
  resetDemo() {
    set(freshState());
  },
  createTender(t: Omit<Tender, 'id' | 'number' | 'createdAt'>): Tender {
    const maxNum = state.tenders.reduce((m, x) => Math.max(m, Number(x.number) || 0), 0);
    const number = String(maxNum + 1).padStart(3, '0');
    const tender: Tender = { ...t, id: `t${number}-${Date.now().toString(36)}`, number, createdAt: new Date().toISOString() };
    set({ ...state, tenders: [tender, ...state.tenders] });
    return tender;
  },
  /** Подать или обновить закрытую ставку (одна ставка на поставщика в тендере) */
  submitBid(bid: Omit<Bid, 'id' | 'submittedAt'>): Bid {
    const full: Bid = { ...bid, id: `${bid.tenderId}-${bid.supplierId}`, submittedAt: new Date().toISOString() };
    set({ ...state, bids: [...state.bids.filter((b) => b.id !== full.id), full] });
    return full;
  },
  /** Демо-кнопка: досрочно завершить приём ставок */
  closeBidding(tenderId: string) {
    set({
      ...state,
      tenders: state.tenders.map((t) => (t.id === tenderId && !t.closedAt ? { ...t, closedAt: new Date().toISOString() } : t)),
    });
  },
  chooseSupplier(tenderId: string, bidId: string) {
    const bid = state.bids.find((b) => b.id === bidId);
    if (!bid) return;
    const total = fullCost(bid);
    set({
      ...state,
      tenders: state.tenders.map((t) =>
        t.id === tenderId
          ? { ...t, deal: { bidId, supplierId: bid.supplierId, total, fee: platformFee(total), confirmedAt: new Date().toISOString() } }
          : t,
      ),
    });
  },
};
