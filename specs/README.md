# KSeF API 2.8.1

`ksef-openapi.snapshot.json` is the official TEST OpenAPI contract downloaded
from https://raw.githubusercontent.com/CIRFMF/ksef-api/main/open-api.json on
2026-10-08. Its `info.description` identifies API 2.8.1 (build 2.8.1-te);
`info.version` is the API family `v2`, not the release number.

The schemas match the snapshot used by the Python client for KSeF 2.8.1.
The snapshot contains 83 operations and is used by model generation, coverage
tests and CI. To update the supported release, replace the snapshot, review
contract changes, update release metadata, then run:

```sh
npm run generate:openapi-models
npm run check:openapi-coverage
npm run typecheck
npm run test:unit
```
