# JWT utils

## API

- `decodeJwtPayload(token)`
- `getJwtExpiryMs(token)`

## Przyklad

```ts
import { getJwtExpiryMs } from "ksef-client-typescript";

const expMs = getJwtExpiryMs(accessToken);
```
