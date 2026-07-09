import { parseFa3XsdElements, type XsdElement } from "./xsdMap";
import { loadFa3SchemaWithLocalImports } from "./xsd";

export const CoverageStatus = {
  SUPPORTED: "supported",
  PARTIALLY_SUPPORTED: "partially_supported",
  RAW_EXTENSION: "raw_extension",
  UNSUPPORTED: "unsupported",
} as const;

export type CoverageStatusValue = (typeof CoverageStatus)[keyof typeof CoverageStatus];

export class XsdCoverageEntry {
  readonly path: string;
  readonly status: CoverageStatusValue;
  readonly note: string;
  readonly domainField: string | undefined;
  readonly handler: string | undefined;

  constructor(value: {
    path: string;
    status: CoverageStatusValue;
    note: string;
    domainField?: string;
    handler?: string;
  }) {
    this.path = value.path;
    this.status = value.status;
    this.note = value.note;
    this.domainField = value.domainField;
    this.handler = value.handler;
  }
}

export class XsdCoverageReport {
  readonly elements: XsdElement[];
  readonly coverage: XsdCoverageEntry[];

  constructor(elements: XsdElement[], coverage: XsdCoverageEntry[]) {
    this.elements = elements;
    this.coverage = coverage;
  }
}

const SUPPORTED_PATHS = new Set([
  "/Faktura",
  "/Faktura/Naglowek",
  "/Faktura/Naglowek/KodFormularza",
  "/Faktura/Naglowek/WariantFormularza",
  "/Faktura/Naglowek/DataWytworzeniaFa",
  "/Faktura/Naglowek/SystemInfo",
  "/Faktura/Podmiot1",
  "/Faktura/Podmiot1/DaneIdentyfikacyjne",
  "/Faktura/Podmiot1/DaneIdentyfikacyjne/NIP",
  "/Faktura/Podmiot1/DaneIdentyfikacyjne/Nazwa",
  "/Faktura/Podmiot1/Adres",
  "/Faktura/Podmiot1/DaneKontaktowe",
  "/Faktura/Podmiot2",
  "/Faktura/Podmiot2/DaneIdentyfikacyjne",
  "/Faktura/Podmiot2/Adres",
  "/Faktura/Podmiot2/DaneKontaktowe",
  "/Faktura/Podmiot2/JST",
  "/Faktura/Podmiot2/GV",
  "/Faktura/Podmiot3",
  "/Faktura/Podmiot3/DaneIdentyfikacyjne",
  "/Faktura/Podmiot3/Adres",
  "/Faktura/Podmiot3/DaneKontaktowe",
  "/Faktura/Podmiot3/Rola",
  "/Faktura/Podmiot3/RolaInna",
  "/Faktura/Podmiot3/OpisRoli",
  "/Faktura/Podmiot3/Udzial",
  "/Faktura/Fa",
  "/Faktura/Fa/KodWaluty",
  "/Faktura/Fa/P_1",
  "/Faktura/Fa/P_1M",
  "/Faktura/Fa/P_2",
  "/Faktura/Fa/P_6",
  "/Faktura/Fa/OkresFa",
  "/Faktura/Fa/P_13_1",
  "/Faktura/Fa/P_14_1",
  "/Faktura/Fa/P_15",
  "/Faktura/Fa/KursWalutyZ",
  "/Faktura/Fa/Adnotacje",
  "/Faktura/Fa/Adnotacje/P_16",
  "/Faktura/Fa/Adnotacje/P_17",
  "/Faktura/Fa/Adnotacje/P_18",
  "/Faktura/Fa/Adnotacje/P_18A",
  "/Faktura/Fa/Adnotacje/Zwolnienie",
  "/Faktura/Fa/Adnotacje/NoweSrodkiTransportu",
  "/Faktura/Fa/Adnotacje/P_23",
  "/Faktura/Fa/Adnotacje/PMarzy",
  "/Faktura/Fa/RodzajFaktury",
  "/Faktura/Fa/PrzyczynaKorekty",
  "/Faktura/Fa/TypKorekty",
  "/Faktura/Fa/DaneFaKorygowanej",
  "/Faktura/Fa/OkresFaKorygowanej",
  "/Faktura/Fa/NrFaKorygowany",
  "/Faktura/Fa/ZaliczkaCzesciowa",
  "/Faktura/Fa/DodatkowyOpis",
  "/Faktura/Fa/FakturaZaliczkowa",
  "/Faktura/Fa/FaWiersz",
  "/Faktura/Fa/FaWiersze",
  "/Faktura/Fa/Rozliczenie",
  "/Faktura/Fa/Platnosc",
]);

const PARTIALLY_SUPPORTED_PREFIXES = [
  "/Faktura/Fa/WarunkiTransakcji",
  "/Faktura/Fa/Transport",
  "/Faktura/Fa/Zamowienie",
  "/Faktura/Zalacznik",
  "/Faktura/Stopka",
];

const SUPPORTED_PREFIXES = [
  "/Faktura/Fa/FaWiersz/",
  "/Faktura/Fa/FaWiersze/",
  "/Faktura/Fa/Rozliczenie/",
  "/Faktura/Fa/Platnosc/",
  "/Faktura/Fa/DodatkowyOpis/",
  "/Faktura/Fa/ZaliczkaCzesciowa/",
  "/Faktura/Fa/FakturaZaliczkowa/",
  "/Faktura/Fa/DaneFaKorygowanej/",
];

function coverageStatus(pathValue: string): CoverageStatusValue {
  if (SUPPORTED_PATHS.has(pathValue) || SUPPORTED_PREFIXES.some((prefix) => pathValue.startsWith(prefix))) {
    return CoverageStatus.SUPPORTED;
  }
  if (PARTIALLY_SUPPORTED_PREFIXES.some((prefix) => pathValue === prefix || pathValue.startsWith(`${prefix}/`))) {
    return CoverageStatus.PARTIALLY_SUPPORTED;
  }
  if (pathValue.includes("RawXmlExtension")) {
    return CoverageStatus.RAW_EXTENSION;
  }
  return CoverageStatus.UNSUPPORTED;
}

function coverageNote(status: CoverageStatusValue): string {
  if (status === CoverageStatus.SUPPORTED) {
    return "covered by typed FA(3) builder or serializer";
  }
  if (status === CoverageStatus.PARTIALLY_SUPPORTED) {
    return "covered for a documented subset of fields";
  }
  if (status === CoverageStatus.RAW_EXTENSION) {
    return "reserved for raw XML extension handling";
  }
  return "not exposed by the typed FA(3) contract";
}

function handlerName(pathValue: string, status: CoverageStatusValue): string | undefined {
  if (status === CoverageStatus.UNSUPPORTED) {
    return undefined;
  }
  if (pathValue.startsWith("/Faktura/Fa/Platnosc")) {
    return "mapPaymentTerms";
  }
  if (pathValue.startsWith("/Faktura/Fa/FaWiersz")) {
    return "mapLine";
  }
  if (pathValue.startsWith("/Faktura/Fa/Zamowienie")) {
    return "mapOrder";
  }
  if (pathValue.startsWith("/Faktura/Fa/Rozliczenie")) {
    return "mapSettlement";
  }
  if (pathValue.startsWith("/Faktura/Fa/Transport")) {
    return "mapTransport";
  }
  if (pathValue.startsWith("/Faktura/Podmiot")) {
    return "mapParty";
  }
  return "FA3Draft.toFakturaInput";
}

function domainField(pathValue: string): string {
  return `invoice.${pathValue.replace(/^\/Faktura\/?/, "").replaceAll("/", ".")}`;
}

export function auditFa3XsdCoverage(options: { elements?: XsdElement[] } = {}): XsdCoverageReport {
  const elements =
    options.elements ??
    parseFa3XsdElements(loadFa3SchemaWithLocalImports().schemaContent);
  const coverage = elements.map((element) => {
    const status = coverageStatus(element.path);
    const handler = handlerName(element.path, status);
    return new XsdCoverageEntry({
      path: element.path,
      status,
      note: coverageNote(status),
      ...(status === CoverageStatus.UNSUPPORTED ? {} : { domainField: domainField(element.path) }),
      ...(handler ? { handler } : {}),
    });
  });
  return new XsdCoverageReport(elements, coverage);
}

export const audit_fa3_xsd_coverage = auditFa3XsdCoverage;
