# Serializacja XML

Ta sekcja opisuje funkcje niskiego poziomu z `src/xml/xml.ts`.

## API

- `parseXml(xml: string): XmlDocument`
- `buildXml(document: XmlDocument): string`
- `buildXmlFromObject(document: XmlObject, options?: { pretty?: boolean }): string`

Typy pomocnicze:

- `XmlDocument = Array<Record<string, unknown>>` (tryb `preserveOrder`)
- `XmlObject = { [key: string]: XmlValue }`
- `XmlValue = string | number | boolean | null | XmlObject | XmlValue[]`

## Kiedy używać której funkcji

- `parseXml` + `buildXml`: gdy chcesz zachować kolejność węzłów i pracować na strukturze tablicowej.
- `buildXmlFromObject`: gdy budujesz dokument z obiektu klucz-wartość (bardziej ergonomicznie, bez `preserveOrder`).

## Konwencje zapisu

- atrybut XML: klucz z prefiksem `@_`, np. `@_xmlns`
- tekst węzła: klucz `#text`
- wynik builderów zawiera deklarację XML z kodowaniem `utf-8`

## Przykład 1: `parseXml` + `buildXml`

```ts
import { buildXml, parseXml } from "ksef-client-typescript";

const doc = parseXml('<Root><A>1</A><B test="x">2</B></Root>');
const xml = buildXml(doc);

console.log(xml);
```

## Przykład 2: `buildXmlFromObject` (z `pretty`)

```ts
import { buildXmlFromObject } from "ksef-client-typescript";

const xml = buildXmlFromObject(
  {
    Root: {
      "@_xmlns": "urn:example",
      Item: { "@_id": "1", "#text": "Wartość" },
    },
  },
  { pretty: true },
);

console.log(xml);
```

## Uwagi operacyjne

- `parseXml(...)` nie waliduje dokumentu względem XSD.
- `buildXmlFromObject(...)` domyślnie generuje XML bez wcięć (`pretty: false`).
