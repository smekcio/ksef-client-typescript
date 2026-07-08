export interface ContinuationPoints {
  [subjectType: string]: string | undefined;
}

export function updateContinuationPoint(
  continuationPoints: ContinuationPoints,
  subjectType: string,
  packageInfo: {
    isTruncated?: boolean;
    lastPermanentStorageDate?: string | null;
    permanentStorageHwmDate?: string | null;
  },
  options: {
    dateType?: string;
  } = {},
): void {
  const dateType = options.dateType?.trim().toLowerCase();
  if (dateType && dateType !== "permanentstorage") {
    delete continuationPoints[subjectType];
    return;
  }
  const isTruncated = Boolean(packageInfo.isTruncated);
  const lastPermanentStorageDate = packageInfo.lastPermanentStorageDate ?? undefined;
  const hwmDate = packageInfo.permanentStorageHwmDate ?? undefined;
  if (isTruncated && lastPermanentStorageDate) {
    continuationPoints[subjectType] = lastPermanentStorageDate;
    return;
  }
  if (hwmDate) {
    continuationPoints[subjectType] = hwmDate;
    return;
  }
  delete continuationPoints[subjectType];
}

export function getEffectiveStartDate(
  continuationPoints: ContinuationPoints,
  subjectType: string,
  windowFrom: string,
): string {
  return continuationPoints[subjectType] ?? windowFrom;
}

export function dedupeByKsefNumber(
  metadataSummaries: Array<Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const unique: Record<string, Record<string, unknown>> = {};
  const seen = new Set<string>();
  for (const summary of metadataSummaries) {
    const value =
      (summary.ksefNumber as string | undefined) ?? (summary.KsefNumber as string | undefined);
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique[value] = summary;
  }
  return unique;
}
