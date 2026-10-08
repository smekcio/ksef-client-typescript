import type {
  EffectiveApiRateLimits,
  EffectiveApiRateLimitValues,
} from "../types/openapi.generated";

export const RATE_LIMIT_GROUPS = [
  "anonymous",
  "batchSession",
  "batchSessionClose",
  "collectiveIdentifier",
  "global",
  "invoiceDownload",
  "invoiceExport",
  "invoiceExportStatus",
  "invoiceMetadata",
  "invoiceSend",
  "invoiceStatus",
  "onlineSession",
  "onlineSessionClose",
  "other",
  "sessionInvoiceList",
  "sessionList",
  "sessionMisc",
] as const satisfies readonly (keyof EffectiveApiRateLimits)[];

export type RateLimitGroup = (typeof RATE_LIMIT_GROUPS)[number];
export const UNLIMITED_RATE_LIMIT = -1;

export interface RateLimitInfo extends EffectiveApiRateLimitValues {
  group: RateLimitGroup;
  /** True only when every window is unlimited; inspect individual windows as well. */
  isUnlimited: boolean;
}

export function getRateLimit(
  limits: Partial<EffectiveApiRateLimits>,
  group: string,
): RateLimitInfo | undefined {
  if (!RATE_LIMIT_GROUPS.includes(group as RateLimitGroup)) return undefined;
  const values = limits[group as RateLimitGroup];
  if (!values) return undefined;
  return {
    ...values,
    group: group as RateLimitGroup,
    isUnlimited: [values.perSecond, values.perMinute, values.perHour].every(
      (value) => value === UNLIMITED_RATE_LIMIT,
    ),
  };
}

export function listRateLimits(limits: Partial<EffectiveApiRateLimits>): RateLimitInfo[] {
  return RATE_LIMIT_GROUPS.flatMap((group) => {
    const info = getRateLimit(limits, group);
    return info ? [info] : [];
  });
}
