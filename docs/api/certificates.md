# Certyfikaty (`certificates`)

Niskopoziomowy klient dla endpointów `/certificates/*`.

## Dostępne metody

- `getCertificateLimits()`
- `getEnrollmentData()`
- `createEnrollment(request)`
- `getEnrollmentStatus(referenceNumber)`
- `queryCertificates(request, pageOffset?, pageSize?)`
- `retrieveCertificates(request)`
- `revokeCertificate(certificateSerialNumber, request?)`

## Najważniejsze informacje

- Typowy przepływ enrollment: `getEnrollmentData` -> przygotowanie CSR lokalnie -> `createEnrollment` -> polling `getEnrollmentStatus`.
- `queryCertificates(...)` przekazuje paginację przez `pageOffset` i `pageSize` w query string (potwierdzone testami jednostkowymi).
- `revokeCertificate(...)` przyjmuje opcjonalne ciało; gdy go nie podasz, SDK wyśle pusty obiekt `{}`.
- Typy request/response dla certyfikatów są celowo szerokie (`JsonObject`) dla kompatybilności z kolejnymi wersjami API.

## Przykłady TypeScript

### Odczyt limitów i danych enrollment

```ts
const limits = await client.certificates.getCertificateLimits();
console.log(limits);

const enrollmentData = await client.certificates.getEnrollmentData();
console.log(enrollmentData);
```

### Utworzenie enrollment i polling statusu

```ts
import { CertificateEnrollmentRequest } from "ksef-client-typescript";

const request: CertificateEnrollmentRequest = {
  // Uzupełnij zgodnie z kontraktem OpenAPI dla /certificates/enrollments.
};

const created = await client.certificates.createEnrollment(request);
const referenceNumber = String(
  (created as { referenceNumber?: string }).referenceNumber ?? "",
);

let completed = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  const status = await client.certificates.getEnrollmentStatus(referenceNumber);
  const code = Number((status as { status?: { code?: number } }).status?.code ?? 0);

  if (code === 200) {
    console.log("Enrollment zakończony");
    completed = true;
    break;
  }
  if (code !== 100) {
    throw new Error(`Enrollment nieudany: ${JSON.stringify(status)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

if (!completed) {
  throw new Error("Przekroczono czas oczekiwania na zakończenie enrollment.");
}
```

### Wyszukiwanie certyfikatów

```ts
const result = await client.certificates.queryCertificates(
  {
    queryCriteria: { status: ["ACTIVE"] },
  },
  10,
  25,
);

console.log(result);
```

### Pobranie danych certyfikatu i cofnięcie

```ts
const certData = await client.certificates.retrieveCertificates({
  certificateSerialNumber: "SERIAL_NUMBER",
});
console.log(certData);

await client.certificates.revokeCertificate("SERIAL_NUMBER", {
  reason: "KeyCompromise",
});
```
