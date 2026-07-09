export const FA3_FORM_VARIANT = "3" as const;

export const CorrectionType = {
  TAX_BASE_OR_TAX: "1",
  OTHER: "2",
  NO_TAX_IMPACT: "3",
} as const;

export const PaymentMethod = {
  CASH: "1",
  CARD: "2",
  VOUCHER: "3",
  CHECK: "4",
  CREDIT: "5",
  TRANSFER: "6",
  COMPENSATION: "7",
} as const;

export const VatRateCode = {
  RATE_23: "23",
  RATE_22: "22",
  RATE_8: "8",
  RATE_7: "7",
  RATE_5: "5",
  RATE_4: "4",
  RATE_3: "3",
  ZERO_DOMESTIC: "0 KR",
  ZERO_WDT: "0 WDT",
  ZERO_EXPORT: "0 EX",
  EXEMPT: "zw",
  REVERSE_CHARGE: "oo",
  OUTSIDE_COUNTRY_1: "np I",
  OUTSIDE_COUNTRY_2: "np II",
} as const;

export const LineProcedure = {
  WSTO_EE: "WSTO_EE",
  IED: "IED",
  TT_D: "TT_D",
  I_42: "I_42",
  I_63: "I_63",
  B_SPV: "B_SPV",
  B_SPV_DOSTAWA: "B_SPV_DOSTAWA",
  B_MPV_PROWIZJA: "B_MPV_PROWIZJA",
} as const;

export const OrderLineProcedure = {
  WSTO_EE: "WSTO_EE",
  IED: "IED",
  TT_D: "TT_D",
  B_SPV: "B_SPV",
  B_SPV_DOSTAWA: "B_SPV_DOSTAWA",
  B_MPV_PROWIZJA: "B_MPV_PROWIZJA",
} as const;

export const GTUCode = {
  GTU_01: "GTU_01",
  GTU_02: "GTU_02",
  GTU_03: "GTU_03",
  GTU_04: "GTU_04",
  GTU_05: "GTU_05",
  GTU_06: "GTU_06",
  GTU_07: "GTU_07",
  GTU_08: "GTU_08",
  GTU_09: "GTU_09",
  GTU_10: "GTU_10",
  GTU_11: "GTU_11",
  GTU_12: "GTU_12",
  GTU_13: "GTU_13",
} as const;

export const TransportKind = {
  SEA: "1",
  RAIL: "2",
  ROAD: "3",
  AIR: "4",
  POSTAL: "5",
  FIXED_TRANSPORT: "7",
  OTHER: "8",
} as const;

export const MarginProcedure = {
  TRAVEL: "travel",
  USED_GOODS: "used_goods",
  ART: "art",
  COLLECTIBLES: "collectibles",
} as const;

export type EnumValue<T extends Record<string, string>> = T[keyof T];
