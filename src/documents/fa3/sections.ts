import { FA3AdvancePayment } from "./types";

export class AdditionalDescription {
  readonly key: string;
  readonly value: string;

  constructor(key: string, value: string) {
    this.key = key;
    this.value = value;
  }

  static keyValue(key: string, value: string): AdditionalDescription {
    return new AdditionalDescription(key, value);
  }
}

export class Registry {
  readonly kind: string;
  readonly number: string;
  readonly fullName: string | undefined;

  constructor(kind: string, number: string, fullName?: string) {
    this.kind = kind;
    this.number = number;
    this.fullName = fullName;
  }

  static krsEntry(number: string, fullName?: string): Registry {
    return new Registry("KRS", number, fullName);
  }
}

export class Footer {
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }
}

export interface LineIdentifiers {
  uniqueId?: string;
  internalIndex?: string;
  gtin?: string;
  pkwiu?: string;
  cn?: string;
  pkob?: string;
}

export class PaymentDue {
  static date(value: string): string {
    return value;
  }

  static description(amount: number, unit: string, startsFrom: string): string {
    return `${amount} ${unit} od ${startsFrom}`;
  }
}

export interface NewTransportMeans {
  allowedDate?: string;
  rowNumber?: number;
  kind?: string;
  mileage?: string;
  serialNumber?: string;
  make?: string;
  model?: string;
}

export class CorrectedAdvanceState {
  readonly text: string;
  constructor(text: string) {
    this.text = text;
  }
}

export class ExciseRefund {
  readonly enabled: boolean;
  constructor(enabled = true) {
    this.enabled = enabled;
  }
}

export interface OrderLine {
  description: string;
  quantity: number | string;
  unitNetPrice: number | string;
  vatRate?: number | string | null;
}

export interface Order {
  number?: string;
  date?: string;
  totalGross?: number | string;
  lines?: OrderLine[];
}

export interface Contract {
  number: string;
  date?: string;
}

export interface Transport {
  kind: string;
  orderNumber?: string;
  cargoDescription?: string;
  packageUnit?: string;
}

export interface TransactionTerms {
  deliveryTerms?: string;
  contractualRate?: string;
  contractualCurrency?: string;
  intermediary?: boolean;
}

export class AdvancePayment {
  static create(
    amount: number | string,
    options: {
      vatRate?: number | string | null;
      paidOn?: string;
      currencyRate?: number | string;
    } = {},
  ): FA3AdvancePayment {
    return {
      amount,
      ...(options.vatRate !== undefined ? { vatRate: options.vatRate } : {}),
      ...(options.paidOn !== undefined ? { paidOn: options.paidOn } : {}),
      ...(options.currencyRate !== undefined ? { currencyRate: options.currencyRate } : {}),
    };
  }
}

export interface ValidationContext {
  source?: string;
  rowNumber?: number;
}
