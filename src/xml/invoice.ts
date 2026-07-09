import { KsefValidationError } from "../errors/errors";
import { FormCode } from "../types/common";
import { buildXml, buildXmlFromObject, XmlDocument, XmlObject, XmlValue } from "./xml";
import { buildPefXml, isPefUblDocumentInput, PefUblDocumentInput } from "./pef";

export type InvoiceXmlInput =
  | string
  | Buffer
  | XmlDocument
  | XmlObject
  | FakturaInput
  | PefUblDocumentInput;

export type FakturaSchema = "FA2" | "FA3";

export interface FakturaXmlOptions {
  schema?: FakturaSchema;
  fakturaNamespace?: string;
  etdNamespace?: string;
  pretty?: boolean;
}

export interface FakturaInput {
  Naglowek: XmlObject;
  Podmiot1?: XmlObject;
  Podmiot2?: XmlObject;
  Fa: XmlObject;
  [key: string]: XmlValue;
}

const DEFAULT_NAMESPACE: Record<FakturaSchema, string> = {
  FA2: "http://crd.gov.pl/wzor/2023/06/29/12648/",
  FA3: "http://crd.gov.pl/wzor/2025/06/25/13775/",
};

const DEFAULT_ETD_NAMESPACE: Record<FakturaSchema, string> = {
  FA2: "http://crd.gov.pl/xml/schematy/2020/10/08/eDokumenty",
  FA3: "http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/",
};

const ORDER_MAP: Record<string, string[]> = {
  Faktura: ["Naglowek", "Podmiot1", "Podmiot2", "Podmiot3", "Fa", "Stopka", "Zalacznik"],
  Naglowek: ["KodFormularza", "WariantFormularza", "DataWytworzeniaFa", "SystemInfo"],
  Podmiot1: [
    "PrefiksPodatnika",
    "NrEORI",
    "DaneIdentyfikacyjne",
    "Adres",
    "AdresKoresp",
    "DaneKontaktowe",
    "StatusInfoPodatnika",
  ],
  Podmiot2: [
    "NrEORI",
    "DaneIdentyfikacyjne",
    "Adres",
    "AdresKoresp",
    "DaneKontaktowe",
    "NrKlienta",
    "IDNabywcy",
    "JST",
    "GV",
  ],
  Podmiot3: [
    "IDNabywcy",
    "NrEORI",
    "DaneIdentyfikacyjne",
    "Adres",
    "AdresKoresp",
    "DaneKontaktowe",
    "Rola",
    "RolaInna",
    "OpisRoli",
    "Udzial",
    "NrKlienta",
  ],
  DaneIdentyfikacyjne: [
    "NIP",
    "IDWew",
    "KodUE",
    "NrVatUE",
    "KodKraju",
    "NrID",
    "BrakID",
    "Nazwa",
    "Identyfikator",
    "KRS",
  ],
  Adres: ["KodKraju", "AdresL1", "AdresL2", "AdresL3"],
  DaneKontaktowe: ["Email", "Telefon"],
  Fa: [
    "KodWaluty",
    "P_1",
    "P_1M",
    "P_2",
    "WZ",
    "P_6",
    "OkresFa",
    "P_13_1",
    "P_14_1",
    "P_14_1W",
    "P_13_2",
    "P_14_2",
    "P_14_2W",
    "P_13_3",
    "P_14_3",
    "P_14_3W",
    "P_13_4",
    "P_14_4",
    "P_14_4W",
    "P_13_5",
    "P_14_5",
    "P_13_6_1",
    "P_13_6_2",
    "P_13_6_3",
    "P_13_7",
    "P_13_8",
    "P_13_9",
    "P_13_10",
    "P_13_11",
    "P_15",
    "KursWalutyZ",
    "Adnotacje",
    "RodzajFaktury",
    "PrzyczynaKorekty",
    "TypKorekty",
    "DaneFaKorygowanej",
    "OkresFaKorygowanej",
    "NrFaKorygowany",
    "Podmiot1K",
    "Podmiot2K",
    "Podmiot3K",
    "ZaliczkaCzesciowa",
    "FP",
    "TP",
    "DodatkowyOpis",
    "FakturaZaliczkowa",
    "ZwrotAkcyzy",
    "FaWiersz",
    "Rozliczenie",
    "Platnosc",
    "WarunkiTransakcji",
    "Transport",
    "PodmiotPosredniczacy",
    "Zamowienie",
  ],
  Adnotacje: [
    "P_16",
    "P_17",
    "P_18",
    "P_18A",
    "Zwolnienie",
    "NoweSrodkiTransportu",
    "P_23",
    "PMarzy",
  ],
  OkresFa: ["P_6_Od", "P_6_Do"],
  FaWiersz: [
    "NrWierszaFa",
    "UU_ID",
    "P_6A",
    "P_7",
    "Indeks",
    "GTIN",
    "PKWiU",
    "CN",
    "PKOB",
    "P_8A",
    "P_8B",
    "P_9A",
    "P_9B",
    "P_10",
    "P_11",
    "P_11A",
    "P_11Vat",
    "P_12",
    "P_12_XII",
    "P_12_Zal_15",
    "KwotaAkcyzy",
    "GTU",
    "Procedura",
    "KursWaluty",
    "StanPrzed",
  ],
  Rozliczenie: ["Obciazenia", "SumaObciazen", "Odliczenia", "SumaOdliczen", "DoZaplaty", "DoRozliczenia"],
  Obciazenia: ["Kwota", "Powod"],
  Odliczenia: ["Kwota", "Powod"],
  Platnosc: [
    "Zaplacono",
    "DataZaplaty",
    "ZnacznikZaplatyCzesciowej",
    "ZaplataCzesciowa",
    "TerminPlatnosci",
    "FormaPlatnosci",
    "PlatnoscInna",
    "OpisPlatnosci",
    "RachunekBankowy",
    "RachunekBankowyFaktora",
    "Skonto",
    "LinkDoPlatnosci",
    "IPKSeF",
  ],
  ZaplataCzesciowa: [
    "KwotaZaplatyCzesciowej",
    "DataZaplatyCzesciowej",
    "FormaPlatnosci",
    "PlatnoscInna",
    "OpisPlatnosci",
  ],
  TerminPlatnosci: ["Termin", "TerminOpis"],
  TerminOpis: ["Ilosc", "Jednostka", "ZdarzeniePoczatkowe"],
  RachunekBankowy: ["NrRB", "SWIFT", "RachunekWlasnyBanku", "NazwaBanku", "OpisRachunku"],
  RachunekBankowyFaktora: ["NrRB", "SWIFT", "RachunekWlasnyBanku", "NazwaBanku", "OpisRachunku"],
  WarunkiTransakcji: [
    "Umowy",
    "Zamowienia",
    "NrPartiiTowaru",
    "WarunkiDostawy",
    "KursUmowny",
    "WalutaUmowna",
    "Transport",
    "PodmiotPosredniczacy",
  ],
  Umowy: ["DataUmowy", "NrUmowy"],
  Zamowienia: ["DataZamowienia", "NrZamowienia"],
  Transport: [
    "RodzajTransportu",
    "TransportInny",
    "OpisInnegoTransportu",
    "Przewoznik",
    "NrZleceniaTransportu",
    "OpisLadunku",
    "LadunekInny",
    "OpisInnegoLadunku",
    "JednostkaOpakowania",
  ],
  Zamowienie: ["WartoscZamowienia", "ZamowienieWiersz"],
  ZamowienieWiersz: [
    "NrWierszaZam",
    "UU_IDZ",
    "P_7Z",
    "IndeksZ",
    "GTINZ",
    "PKWiUZ",
    "CNZ",
    "PKOBZ",
    "P_8AZ",
    "P_8BZ",
    "P_9AZ",
    "P_11NettoZ",
    "P_11VatZ",
    "P_12Z",
    "P_12Z_XII",
    "P_12Z_Zal_15",
    "GTUZ",
    "ProceduraZ",
    "KwotaAkcyzyZ",
    "StanPrzedZ",
  ],
};

function stripBom(input: string): string {
  if (input.charCodeAt(0) === 0xfeff) {
    return input.slice(1);
  }
  return input;
}

export function serializeInvoiceXml(input: InvoiceXmlInput, options?: FakturaXmlOptions): Buffer {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (typeof input === "string") {
    const cleaned = stripBom(input);
    return Buffer.from(cleaned, "utf8");
  }
  if (Array.isArray(input)) {
    const xml = buildXml(input);
    const cleaned = stripBom(xml);
    return Buffer.from(cleaned, "utf8");
  }
  if (isPefUblDocumentInput(input)) {
    const xml = buildPefXml(input);
    const cleaned = stripBom(xml);
    return Buffer.from(cleaned, "utf8");
  }
  if (isFakturaInput(input)) {
    const xml = buildFakturaXml(input, options);
    const cleaned = stripBom(xml);
    return Buffer.from(cleaned, "utf8");
  }
  if (typeof input === "object" && input) {
    const prettyOptions = options?.pretty === undefined ? undefined : { pretty: options.pretty };
    const xml = buildXmlFromObject(input as XmlObject, prettyOptions);
    const cleaned = stripBom(xml);
    return Buffer.from(cleaned, "utf8");
  }
  throw new KsefValidationError("Unsupported invoice input type.");
}

export function buildFakturaXml(faktura: FakturaInput, options: FakturaXmlOptions = {}): string {
  const schema = options.schema ?? "FA3";
  const fakturaNamespace = options.fakturaNamespace ?? DEFAULT_NAMESPACE[schema];
  const etdNamespace = options.etdNamespace ?? DEFAULT_ETD_NAMESPACE[schema];

  const normalized = normalizeFakturaInput(faktura);
  const ordered = orderXmlObject(normalized, "Faktura");
  const document: XmlObject = {
    Faktura: {
      "@_xmlns": fakturaNamespace,
      "@_xmlns:etd": etdNamespace,
      ...ordered,
    },
  };

  const prettyOptions = options.pretty === undefined ? undefined : { pretty: options.pretty };
  return buildXmlFromObject(document, prettyOptions);
}

function normalizeFakturaInput(input: FakturaInput): XmlObject {
  const result: XmlObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "KodFormularza" && isFormCode(value)) {
      result[key] = toKodFormularza(value);
      continue;
    }
    if (key === "Naglowek" && isObject(value)) {
      result[key] = normalizeNaglowek(value as XmlObject);
      continue;
    }
    result[key] = normalizeValueForKey(key, value);
  }
  return result;
}

function normalizeNaglowek(value: XmlObject): XmlObject {
  const result: XmlObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "KodFormularza" && isFormCode(item)) {
      result[key] = toKodFormularza(item);
      continue;
    }
    result[key] = normalizeValueForKey(key, item);
  }
  return result;
}

function normalizeValue(value: XmlValue): XmlValue {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (isObject(value)) {
    return orderXmlObject(value as XmlObject);
  }
  return value;
}

function normalizeValueForKey(key: string, value: XmlValue): XmlValue {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (isObject(item)) {
        return orderXmlObject(item as XmlObject, key);
      }
      return normalizeValue(item);
    });
  }
  if (isObject(value)) {
    return orderXmlObject(value as XmlObject, key);
  }
  return value;
}

function orderXmlObject(value: XmlObject, contextKey?: string): XmlObject {
  const order = contextKey ? ORDER_MAP[contextKey] : undefined;
  const keys = Object.keys(value);
  const used = new Set<string>();
  const ordered: XmlObject = {};

  if (order) {
    for (const key of order) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const item = value[key];
        if (item !== undefined) {
          ordered[key] = normalizeValueForKey(key, item);
        }
        used.add(key);
      }
    }
  }

  const pKeys = keys.filter((key) => !used.has(key) && key.startsWith("P_")).sort(comparePKey);
  for (const key of pKeys) {
    const item = value[key];
    if (item !== undefined) {
      ordered[key] = normalizeValueForKey(key, item);
    }
    used.add(key);
  }

  for (const key of keys) {
    if (used.has(key)) {
      continue;
    }
    const item = value[key];
    if (item !== undefined) {
      ordered[key] = normalizeValueForKey(key, item);
    }
  }

  return ordered;
}

function comparePKey(a: string, b: string): number {
  const normalize = (value: string) =>
    value
      .replace(/^P_/, "")
      .split("_")
      .map((part) => (Number.isNaN(Number(part)) ? part : Number(part)));
  const aParts = normalize(a);
  const bParts = normalize(b);
  const max = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < max; i += 1) {
    const left = aParts[i];
    const right = bParts[i];
    if (left === undefined) {
      return -1;
    }
    if (right === undefined) {
      return 1;
    }
    if (typeof left === "number" && typeof right === "number") {
      if (left !== right) {
        return left - right;
      }
      continue;
    }
    const leftStr = String(left);
    const rightStr = String(right);
    if (leftStr !== rightStr) {
      return leftStr.localeCompare(rightStr);
    }
  }
  return 0;
}

function isFormCode(value: unknown): value is FormCode {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as {
    systemCode?: unknown;
    schemaVersion?: unknown;
    value?: unknown;
  };
  return (
    typeof candidate.systemCode === "string" &&
    typeof candidate.schemaVersion === "string" &&
    typeof candidate.value === "string"
  );
}

function toKodFormularza(formCode: FormCode): XmlObject {
  return {
    "@_kodSystemowy": formCode.systemCode,
    "@_wersjaSchemy": formCode.schemaVersion,
    "#text": formCode.value,
  };
}

function isFakturaInput(input: unknown): input is FakturaInput {
  if (!isObject(input)) {
    return false;
  }
  return (
    Object.prototype.hasOwnProperty.call(input, "Naglowek") &&
    Object.prototype.hasOwnProperty.call(input, "Fa")
  );
}

function isObject(value: unknown): value is XmlObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
