# HWM i deduplikacja (`hwmCoordinator`)

W eksporcie przyrostowym najczęściej pojawiają się trzy tematy:
- continuation points (HWM)
- paczki obcięte (`isTruncated`)
- duplikaty między oknami czasowymi

## `updateContinuationPoint(continuationPoints, subjectType, packageInfo)`

Aktualizuje punkt kontynuacji na podstawie danych paczki:
- jeśli `isTruncated === true` i jest `lastPermanentStorageDate` -> zapisuje `lastPermanentStorageDate`
- w przeciwnym razie, jeśli jest `permanentStorageHwmDate` -> zapisuje `permanentStorageHwmDate`
- jeśli brak sensownego punktu -> usuwa wpis dla `subjectType`

## `getEffectiveStartDate(continuationPoints, subjectType, windowFrom) -> string`

Zwraca:
- `continuationPoints[subjectType]`, jeśli istnieje
- w przeciwnym razie `windowFrom`

## `dedupeByKsefNumber(metadataSummaries)`

Usuwa duplikaty po numerze KSeF (case-insensitive). Obsługuje zarówno `ksefNumber`, jak i `KsefNumber`.

Zwraca mapę: `Record<ksefNumber, rekord>`.

Przykład:

```ts
import {
  dedupeByKsefNumber,
  getEffectiveStartDate,
  updateContinuationPoint,
} from "ksef-client-typescript";

const continuationPoints: Record<string, string | undefined> = {};

updateContinuationPoint(continuationPoints, "Subject1", {
  isTruncated: true,
  lastPermanentStorageDate: "2025-01-10T12:00:00Z",
});

const from = getEffectiveStartDate(continuationPoints, "Subject1", "2025-01-01");

const deduped = dedupeByKsefNumber([
  { ksefNumber: "ABC", amount: 1 },
  { ksefNumber: "abc", amount: 2 },
  { KsefNumber: "XYZ", amount: 3 },
]);

console.log(from, Object.keys(deduped));
```

Powiązane: [Workflows i scenariusze](workflows.md).
