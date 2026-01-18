import { KsefValidationError } from "../errors/errors";
import { buildXmlFromObject, XmlObject } from "./xml";

export type PefSchema = "PEF" | "PEF_KOR";

export interface PefUblInvoiceInput {
  schema?: "PEF";
  Invoice: XmlObject;
}

export interface PefUblCreditNoteInput {
  schema?: "PEF_KOR";
  CreditNote: XmlObject;
}

export type PefUblDocumentInput = PefUblInvoiceInput | PefUblCreditNoteInput;

const DEFAULT_NAMESPACE: Record<PefSchema, string> = {
  PEF: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  PEF_KOR: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
};

function inferSchema(input: PefUblDocumentInput): PefSchema {
  return "Invoice" in input ? "PEF" : "PEF_KOR";
}

export function isPefUblDocumentInput(input: unknown): input is PefUblDocumentInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }
  const obj = input as Record<string, unknown>;
  const invoice = obj.Invoice;
  const creditNote = obj.CreditNote;
  const hasInvoice = typeof invoice === "object" && invoice !== null && !Array.isArray(invoice);
  const hasCreditNote =
    typeof creditNote === "object" && creditNote !== null && !Array.isArray(creditNote);
  return hasInvoice !== hasCreditNote;
}

export function buildPefXml(
  input: PefUblDocumentInput,
  options: { pretty?: boolean } = {},
): string {
  const inferred = inferSchema(input);
  const schema = input.schema ?? inferred;
  if (schema !== inferred) {
    throw new KsefValidationError(
      `PEF schema mismatch: expected ${inferred} based on root, got ${schema}.`,
    );
  }

  if ("Invoice" in input) {
    const document: XmlObject = {
      Invoice: {
        "@_xmlns": DEFAULT_NAMESPACE.PEF,
        "@_xmlns:ext": "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
        "@_xmlns:cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
        "@_xmlns:cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
        "@_xmlns:cbc-pl": "urn:pl:extended:CommonBasicComponents-2",
        "@_xmlns:cac-pl": "urn:pl:extended:CommonAggregateComponents-2",
        ...input.Invoice,
      },
    };
    return buildXmlFromObject(document, { pretty: options.pretty ?? false });
  }

  const document: XmlObject = {
    CreditNote: {
      "@_xmlns": DEFAULT_NAMESPACE.PEF_KOR,
      "@_xmlns:ext": "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
      "@_xmlns:cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
      "@_xmlns:cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
      "@_xmlns:cbc-pl": "urn:pl:extended:CommonBasicComponents-2",
      "@_xmlns:cac-pl": "urn:pl:extended:CommonAggregateComponents-2",
      ...input.CreditNote,
    },
  };

  return buildXmlFromObject(document, { pretty: options.pretty ?? false });
}
