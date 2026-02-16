# Certificates

Thin client dla `/certificates/*`.

## Metody

- `getCertificateLimits()`
- `getEnrollmentData()`
- `createEnrollment(request)`
- `getEnrollmentStatus(referenceNumber)`
- `queryCertificates(request, pageOffset?, pageSize?)`
- `retrieveCertificates(request)`
- `revokeCertificate(certificateSerialNumber, request?)`

## Co warto wiedziec

- Proces enrollment zwykle sklada sie z: `getEnrollmentData` -> lokalny CSR -> `createEnrollment` -> polling `getEnrollmentStatus`.
- `revokeCertificate` przyjmuje opcjonalny payload; gdy go nie podasz, SDK wysyla pusty obiekt.
- Typy request/response sa celowo szerokie (`JsonObject`) dla kompatybilnosci z kolejnymi rewizjami API.

## Przyklad 1: odczyt limitow i danych enrollment

```ts
const limits = await client.certificates.getCertificateLimits();
console.log(limits);

const enrollmentData = await client.certificates.getEnrollmentData();
console.log(enrollmentData);
```

## Przyklad 2: utworzenie enrollment i polling statusu

```ts
const created = await client.certificates.createEnrollment({
  // payload zalezy od kontraktu API i wygenerowanego CSR
  csr: "-----BEGIN CERTIFICATE REQUEST-----...-----END CERTIFICATE REQUEST-----",
});

const referenceNumber = String(created.referenceNumber ?? "");
for (let attempt = 0; attempt < 60; attempt += 1) {
  const status = await client.certificates.getEnrollmentStatus(referenceNumber);
  const code =
    typeof status === "object" && status !== null
      ? Number((status as { status?: { code?: number } }).status?.code ?? 0)
      : 0;
  if (code === 200) {
    console.log("Enrollment completed");
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
```

## Przyklad 3: query certyfikatow

```ts
const query = await client.certificates.queryCertificates({
  queryCriteria: { status: ["ACTIVE"] },
}, 0, 50);

console.log(query);
```

## Przyklad 4: pobranie certyfikatu i revoke

```ts
const certData = await client.certificates.retrieveCertificates({
  certificateSerialNumber: "SERIAL_NUMBER",
});

console.log(certData);

await client.certificates.revokeCertificate("SERIAL_NUMBER", {
  reason: "KeyCompromise",
});
```

const query = await client.certificates.queryCertificates({
  queryCriteria: { status: ["ACTIVE"] },
});
```
