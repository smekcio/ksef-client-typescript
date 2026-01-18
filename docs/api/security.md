# Security

Thin client dla `/security/public-key-certificates`.

## Metody

- `getPublicKeyCertificates()`

## Przyklad

```ts
const certs = await client.security.getPublicKeyCertificates();
const tokenCert = certs.find((c) => c.usage.includes("KsefTokenEncryption"));
```
