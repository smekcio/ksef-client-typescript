# Numer KSeF

Walidacja numeru KSeF obejmuje format wejścia i zgodność sumy kontrolnej CRC-8.

## API

- `validateKsefNumber(ksefNumber: string): KsefNumberValidationResult`

```ts
interface KsefNumberValidationResult {
  isValid: boolean;
  message?: string;
}
```

## Co jest sprawdzane

1. Czy numer nie jest pusty.
2. Czy format ma poprawną długość:
   - format aktualny: 35 znaków,
   - format alternatywny: 36 znaków (wariant pięciosegmentowy z dodatkowymi myślnikami), który SDK normalizuje do formatu 35-znakowego.
3. Czy zgadza się suma kontrolna (ostatnie 2 znaki) wyliczona jako `crc8Hex(main)`, gdzie `main` to pierwsze 32 znaki numeru po normalizacji.

## Przykład

```ts
import { validateKsefNumber } from "ksef-client-typescript";

const ok = validateKsefNumber("5265877635-20250826-0100001AF629-AF");
const bad = validateKsefNumber("5265877635-20250826-0100001AF629-00");

console.log(ok.isValid); // true
console.log(bad.isValid, bad.message); // false, opis błędu
```

## Uwagi operacyjne

- W przypadku błędu `message` zawiera techniczny opis przyczyny (w języku angielskim, zgodnie z implementacją).
- Funkcja wykonuje walidację lokalną, bez wywołań API.
