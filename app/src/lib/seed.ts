/** Превращает seed.json в состояние приложения (время — относительно момента загрузки). */
import type { Bid, Requirement, Supplier, SupplierId, Tender } from '../types';

interface SeedBid {
  supplierId: SupplierId;
  goodsPrice: number;
  deliveryCost: number;
  deliveryDays: number;
  hours: number;
  comment: string;
}

interface SeedTender {
  id: string;
  number: string;
  title: string;
  category: string;
  itemKey: string;
  quantity: number;
  unit: string;
  region: string;
  buyer: string;
  deliveryDays: number;
  deadlineHours?: number;
  deadlineDayOffset?: number;
  deadlineTime?: string;
  createdHours: number;
  closed?: boolean;
  budget?: number;
  requirements: Requirement[];
  bids: SeedBid[];
}

export interface SeedFile {
  suppliers: Supplier[];
  tenders: SeedTender[];
}

export interface DataState {
  suppliers: Supplier[];
  tenders: Tender[];
  bids: Bid[];
}

const HOUR = 3_600_000;

function deadlineOf(t: SeedTender, now: Date): Date {
  if (t.deadlineHours !== undefined) return new Date(now.getTime() + t.deadlineHours * HOUR);
  const d = new Date(now);
  d.setDate(d.getDate() + (t.deadlineDayOffset ?? 1));
  const [hh, mm] = (t.deadlineTime ?? '18:00').split(':').map(Number);
  d.setHours(hh, mm, 0, 0);
  return d;
}

export function buildSeedState(seed: SeedFile, now: Date = new Date()): DataState {
  const tenders: Tender[] = [];
  const bids: Bid[] = [];
  for (const t of seed.tenders) {
    const deadline = deadlineOf(t, now);
    tenders.push({
      id: t.id,
      number: t.number,
      title: t.title,
      category: t.category,
      itemKey: t.itemKey,
      quantity: t.quantity,
      unit: t.unit,
      region: t.region,
      buyer: t.buyer,
      deliveryDays: t.deliveryDays,
      deadline: deadline.toISOString(),
      createdAt: new Date(now.getTime() + t.createdHours * HOUR).toISOString(),
      requirements: t.requirements,
      budget: t.budget,
      closedAt: t.closed ? deadline.toISOString() : undefined,
    });
    for (const b of t.bids) {
      bids.push({
        id: `${t.id}-${b.supplierId}`,
        tenderId: t.id,
        supplierId: b.supplierId,
        goodsPrice: b.goodsPrice,
        deliveryCost: b.deliveryCost,
        deliveryDays: b.deliveryDays,
        requirementsMet: Object.fromEntries(t.requirements.map((r) => [r.id, true])),
        comment: b.comment,
        submittedAt: new Date(now.getTime() + b.hours * HOUR).toISOString(),
        filledBy: 'manual',
      });
    }
  }
  return { suppliers: seed.suppliers, tenders, bids };
}
