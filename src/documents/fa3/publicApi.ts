import type {
  FA3InvoiceKind as FA3InvoiceKindType,
  FA3Line as FA3LineType,
  FA3Party as FA3PartyType,
  FA3PaymentMethod,
  FA3Settlement as FA3SettlementType,
  FA3ValidationIssue as FA3ValidationIssueType,
} from "./types";
import type {
  Annotation as AnnotationType,
  Attachment as AttachmentType,
  AttachmentBlock as AttachmentBlockType,
  AttachmentTable as AttachmentTableType,
  BankAccount as BankAccountType,
  CorrectionReference as CorrectionReferenceType,
  PaymentTerms as PaymentTermsType,
  RawXmlExtension as RawXmlExtensionType,
} from "./domain";
import type {
  Contract as ContractType,
  LineIdentifiers as LineIdentifiersType,
  NewTransportMeans as NewTransportMeansType,
  Order as OrderType,
  OrderLine as OrderLineType,
  TransactionTerms as TransactionTermsType,
  Transport as TransportType,
  ValidationContext as ValidationContextType,
} from "./sections";

export const FA3InvoiceKind = {
  BASIC: "basic",
  SIMPLIFIED: "simplified",
  CORRECTION: "correction",
  ADVANCE: "advance",
  SETTLEMENT: "settlement",
  ADVANCE_CORRECTION: "advance_correction",
  SETTLEMENT_CORRECTION: "settlement_correction",
} as const satisfies Record<string, FA3InvoiceKindType>;

export const FA3Party = {
  create(input: FA3PartyType): FA3PartyType {
    return { ...input };
  },
};

export const FA3Line = {
  create(input: FA3LineType): FA3LineType {
    return { ...input };
  },
};

export class FA3ValidationIssue implements FA3ValidationIssueType {
  code: string;
  message: string;
  path?: string;

  constructor(message: string, code = "validation_issue", path?: string) {
    this.code = code;
    this.message = message;
    if (path !== undefined) {
      this.path = path;
    }
  }

  withLocation(path: string): FA3ValidationIssue {
    return new FA3ValidationIssue(this.message, this.code, path);
  }
}

export const Annotation = {
  create(key: string, value: string): AnnotationType {
    return { key, value };
  },
  splitPayment(): AnnotationType {
    return { key: "split_payment", value: "1" };
  },
  cashMethod(): AnnotationType {
    return { key: "cash_method", value: "1" };
  },
};

export const AttachmentTable = {
  create(input: AttachmentTableType): AttachmentTableType {
    return {
      headers: [...input.headers],
      rows: input.rows.map((row) => [...row]),
      ...(input.columnTypes ? { columnTypes: [...input.columnTypes] } : {}),
      ...(input.metadata ? { metadata: [...input.metadata] } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.footer ? { footer: [...input.footer] } : {}),
    };
  },
};

export const AttachmentBlock = {
  create(input: AttachmentBlockType = {}): AttachmentBlockType {
    return {
      ...(input.header ? { header: input.header } : {}),
      ...(input.metadata ? { metadata: [...input.metadata] } : {}),
      ...(input.paragraphs ? { paragraphs: [...input.paragraphs] } : {}),
      ...(input.tables ? { tables: [...input.tables] } : {}),
    };
  },
};

export const Attachment = {
  create(blocks: AttachmentBlockType[]): AttachmentType {
    return { blocks: [...blocks] };
  },
  text(header: string, ...paragraphs: string[]): AttachmentType {
    return {
      blocks: [
        {
          header,
          paragraphs,
        },
      ],
    };
  },
};

export const BankAccount = {
  create(number: string, description?: string): BankAccountType {
    return {
      number,
      ...(description ? { description } : {}),
    };
  },
};

export const Contract = {
  create(number: string, date?: string): ContractType {
    return {
      number,
      ...(date ? { date } : {}),
    };
  },
};

export const CorrectionReference = {
  create(invoiceNumber: string, issueDate?: string, ksefNumber?: string): CorrectionReferenceType {
    return {
      invoiceNumber,
      ...(issueDate ? { issueDate } : {}),
      ...(ksefNumber ? { ksefNumber } : {}),
    };
  },
};

export const LineIdentifiers = {
  create(value: LineIdentifiersType): LineIdentifiersType {
    return { ...value };
  },
};

export const NewTransportMeans = {
  create(value: NewTransportMeansType): NewTransportMeansType {
    return { ...value };
  },
};

export const OrderLine = {
  create(value: OrderLineType): OrderLineType {
    return { ...value };
  },
};

export const Order = {
  create(value: OrderType): OrderType {
    return {
      ...value,
      ...(value.lines ? { lines: [...value.lines] } : {}),
    };
  },
};

export const PaymentTerms = {
  create(value: PaymentTermsType): PaymentTermsType {
    return {
      ...value,
      ...(value.partialPayments ? { partialPayments: [...value.partialPayments] } : {}),
      ...(value.bankAccounts ? { bankAccounts: [...value.bankAccounts] } : {}),
    };
  },
  transfer(options: { dueDate?: string; bankAccount?: BankAccountType } = {}): PaymentTermsType {
    return {
      ...(options.dueDate ? { dueDate: options.dueDate } : {}),
      method: "6" as FA3PaymentMethod,
      ...(options.bankAccount ? { bankAccounts: [options.bankAccount] } : {}),
    };
  },
};

export const RawXmlExtension = {
  create(path: string, xml: string): RawXmlExtensionType {
    return { path, xml };
  },
};

export const Settlement = {
  create(value: FA3SettlementType): FA3SettlementType {
    return {
      ...value,
      ...(value.charges ? { charges: [...value.charges] } : {}),
      ...(value.deductions ? { deductions: [...value.deductions] } : {}),
    };
  },
};

export const TransactionTerms = {
  create(value: TransactionTermsType): TransactionTermsType {
    return { ...value };
  },
};

export const Transport = {
  create(value: TransportType): TransportType {
    return { ...value };
  },
};

export const ValidationContext = {
  create(source?: string, rowNumber?: number): ValidationContextType {
    return {
      ...(source ? { source } : {}),
      ...(rowNumber !== undefined ? { rowNumber } : {}),
    };
  },
};
