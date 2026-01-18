# HWM (continuation points)

`hwmCoordinator` udostepnia funkcje pomocnicze do eksportu przyrostowego.

## Przyklad

```ts
import { updateContinuationPoint, getEffectiveStartDate } from "ksef-client-typescript";

const points = {};
updateContinuationPoint(points, "Subject1", {
  isTruncated: false,
  permanentStorageHwmDate: "2025-01-31",
});

const fromDate = getEffectiveStartDate(points, "Subject1", "2025-01-01");
```
