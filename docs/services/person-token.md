# PersonTokenService

Parser dla JWT tokena osoby (claims).

## Przyklad

```ts
import { PersonTokenService } from "ksef-client-typescript";

const info = new PersonTokenService().parse(accessToken);
console.log(info.roles);
```
