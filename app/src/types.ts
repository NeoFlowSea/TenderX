export type SupplierId = 'A' | 'B' | 'C';
export type Role = 'buyer' | 'supplier';

export interface Supplier {
  id: SupplierId;
  name: string;
  city: string;
  note: string;
}

export interface Requirement {
  id: string;
  text: string;
}

export interface Deal {
  bidId: string;
  supplierId: SupplierId;
  total: number;
  fee: number;
  confirmedAt: string;
}

export interface Tender {
  id: string;
  number: string;
  title: string;
  category: string;
  /** ключ товара в market_prices.json (или 'other') */
  itemKey: string;
  quantity: number;
  unit: string;
  region: string;
  buyer: string;
  /** максимальный срок поставки, дней */
  deliveryDays: number;
  /** ISO-дата дедлайна приёма ставок */
  deadline: string;
  createdAt: string;
  requirements: Requirement[];
  budget?: number;
  /** заказчик досрочно завершил приём ставок (демо-кнопка) */
  closedAt?: string;
  deal?: Deal;
}

export interface Bid {
  id: string;
  tenderId: string;
  supplierId: SupplierId;
  /** стоимость товара за весь лот, UZS */
  goodsPrice: number;
  /** стоимость доставки, UZS */
  deliveryCost: number;
  /** срок поставки, дней */
  deliveryDays: number;
  /** подтверждение каждого обязательного требования */
  requirementsMet: Record<string, boolean>;
  comment: string;
  submittedAt: string;
  /** как была заполнена форма: вручную, правилами или Claude */
  filledBy?: 'manual' | 'rules' | 'claude';
}

export interface MarketPrice {
  itemKey: string;
  name: string;
  unit: string;
  /** нижняя граница коридора, UZS за единицу (товар без доставки) */
  low: number;
  /** верхняя граница коридора, UZS за единицу */
  high: number;
  source: string;
  asOf: string;
}

export type TenderStatus = 'open' | 'opened' | 'deal';
