# CSR (`ksef-client-typescript`)

W aktualnej warstwie `services` biblioteka TypeScript nie udostępnia dedykowanej funkcji typu `generateCsrRsa()` / `generateCsrEc()`.

## Jak wygląda workflow enrollment w TS

1. Pobierz dane enrollment:

```ts
const enrollmentData = await client.certificates.getEnrollmentData();
```

2. Wygeneruj CSR poza SDK (np. `node-forge`, `pkijs`, `openssl`) zgodnie z danymi z `enrollmentData`.
3. Wyślij CSR do KSeF:

```ts
const created = await client.certificates.createEnrollment({
  csr: "-----BEGIN CERTIFICATE REQUEST-----...-----END CERTIFICATE REQUEST-----",
});
```

4. Polling statusu:

```ts
const status = await client.certificates.getEnrollmentStatus(String(created.referenceNumber));
console.log(status);
```

## Najważniejsza uwaga praktyczna

Subject/DN w CSR musi odpowiadać danym enrollment z KSeF. W przypadku błędów walidacji enrollmentu to pierwszy element do porównania.

Powiązane: [API certyfikatów](../api/certificates.md).
