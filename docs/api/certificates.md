# Certificates

Thin client dla `/certificates/*`.

## Metody

- `getCertificateLimits()`
- `getEnrollmentData()`
- `createEnrollment(request)`
- `getEnrollmentStatus(referenceNumber)`
- `queryCertificates(request)`
- `retrieveCertificates(request)`
- `revokeCertificate(certificateSerialNumber, request?)`

## Przyklad

```ts
const limits = await client.certificates.getCertificateLimits();

const query = await client.certificates.queryCertificates({
  queryCriteria: { status: ["ACTIVE"] },
});
```
