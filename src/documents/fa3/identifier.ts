import { KsefValidationError } from "../../errors/errors";
import { XmlObject } from "../../xml/xml";
import type { FA3Party, FA3PartyIdentifier, FA3ValidationIssue } from "./types";

export const PartyIdentifierKind = {
  NIP: "NIP",
  EU_VAT: "EU_VAT",
  FOREIGN: "FOREIGN",
  INTERNAL: "INTERNAL",
  NONE: "NONE",
} as const;

export type PartyIdentifierKindValue = (typeof PartyIdentifierKind)[keyof typeof PartyIdentifierKind];

export type ResolvedPartyIdentifier = FA3PartyIdentifier;

export const SELLER_NIP_REQUIRED_MESSAGE =
  "Podmiot1/PodmiotUpowazniony wymaga identyfikatora NIP.";

const EU_COUNTRY_CODES = new Set([
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "EE",
  "EL",
  "ES",
  "FI",
  "FR",
  "HR",
  "HU",
  "IE",
  "IT",
  "LT",
  "LU",
  "LV",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SE",
  "SI",
  "SK",
]);

function normalizeParty(party: FA3Party): FA3Party & { countryCode: string } {
  return {
    ...party,
    countryCode: (party.countryCode ?? "PL").toUpperCase(),
  };
}

export function resolvePartyIdentifier(party: FA3Party): ResolvedPartyIdentifier {
  if (party.identifier) {
    const identifier = party.identifier;
    return {
      kind: identifier.kind,
      ...(identifier.value !== undefined ? { value: identifier.value.trim() } : {}),
      ...(identifier.countryCode
        ? { countryCode: identifier.countryCode.toUpperCase() }
        : {}),
    };
  }

  const normalized = normalizeParty(party);
  const taxId = normalized.taxId.trim();
  const countryCode = normalized.countryCode;

  if (normalized.internalId?.trim()) {
    return {
      kind: PartyIdentifierKind.INTERNAL,
      value: normalized.internalId.trim(),
    };
  }

  if (taxId.toUpperCase() === "BRAK") {
    return { kind: PartyIdentifierKind.NONE };
  }

  const foreignMatch = /^([A-Z]{2}):(.*)$/i.exec(taxId);
  if (foreignMatch?.[1] && foreignMatch[2]?.trim()) {
    return {
      kind: PartyIdentifierKind.FOREIGN,
      countryCode: foreignMatch[1].toUpperCase(),
      value: foreignMatch[2].trim(),
    };
  }

  const vatPrefix = taxId.slice(0, 2).toUpperCase();
  if (countryCode !== "PL" && EU_COUNTRY_CODES.has(vatPrefix) && taxId.length > 2) {
    return {
      kind: PartyIdentifierKind.EU_VAT,
      countryCode: vatPrefix,
      value: taxId.slice(2),
    };
  }

  if (countryCode !== "PL") {
    return {
      kind: PartyIdentifierKind.FOREIGN,
      countryCode,
      value: taxId,
    };
  }

  return {
    kind: PartyIdentifierKind.NIP,
    value: taxId,
  };
}

export function validatePartyIdentifier(
  identifier: ResolvedPartyIdentifier,
  path: string,
): FA3ValidationIssue[] {
  const issues: FA3ValidationIssue[] = [];
  if (identifier.kind === PartyIdentifierKind.NONE) {
    return issues;
  }
  if (!String(identifier.value ?? "").trim()) {
    issues.push({
      code: "identifier_required",
      path: `${path}.identifier`,
      message: `${path}: identyfikator jest wymagany.`,
    });
  }
  if (
    identifier.kind === PartyIdentifierKind.EU_VAT &&
    !String(identifier.countryCode ?? "").trim()
  ) {
    issues.push({
      code: "eu_vat_country_required",
      path: `${path}.identifier.countryCode`,
      message: `${path}: kod kraju UE jest wymagany dla numeru VAT UE.`,
    });
  }
  return issues;
}

export function validateSellerPartyIdentifier(
  identifier: ResolvedPartyIdentifier,
  path: string,
): FA3ValidationIssue[] {
  const issues = validatePartyIdentifier(identifier, path);
  if (identifier.kind !== PartyIdentifierKind.NIP) {
    issues.push({
      code: "seller_nip_required",
      path,
      message: SELLER_NIP_REQUIRED_MESSAGE,
    });
  }
  return issues;
}

export function mapPartyIdentityToXml(
  identifier: ResolvedPartyIdentifier,
  name: string,
  context: "seller" | "buyer",
): XmlObject {
  const baseName = { Nazwa: name };

  if (context === "seller") {
    if (identifier.kind !== PartyIdentifierKind.NIP) {
      throw new KsefValidationError(SELLER_NIP_REQUIRED_MESSAGE);
    }
    return {
      NIP: identifier.value ?? "",
      ...baseName,
    };
  }

  switch (identifier.kind) {
    case PartyIdentifierKind.NIP:
      return {
        NIP: identifier.value ?? "",
        ...baseName,
      };
    case PartyIdentifierKind.EU_VAT:
      return {
        KodUE: identifier.countryCode ?? "",
        NrVatUE: identifier.value ?? "",
        ...baseName,
      };
    case PartyIdentifierKind.FOREIGN:
      return {
        ...(identifier.countryCode ? { KodKraju: identifier.countryCode } : {}),
        NrID: identifier.value ?? "",
        ...baseName,
      };
    case PartyIdentifierKind.NONE:
      return {
        BrakID: "1",
        ...baseName,
      };
    case PartyIdentifierKind.INTERNAL:
      return {
        IDWew: identifier.value ?? "",
        ...baseName,
      };
    default:
      return {
        NIP: identifier.value ?? "",
        ...baseName,
      };
  }
}
