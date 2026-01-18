import { InvoiceExportWorkflow } from "./invoiceExportWorkflow";
import {
  ContinuationPoints,
  dedupeByKsefNumber,
  getEffectiveStartDate,
  updateContinuationPoint,
} from "./hwmCoordinator";
import { InvoiceQueryFilters } from "../types/invoices";

export interface IncrementalExportOptions {
  subjectType: string;
  windowFrom: string;
  windowTo: string;
  continuationPoints: ContinuationPoints;
  maxIterations?: number;
  verifyHashes?: boolean;
  pollIntervalMs?: number;
  maxAttempts?: number;
  filtersFactory?: (from: string, to: string) => InvoiceQueryFilters;
}

export interface IncrementalExportResult {
  referenceNumbers: string[];
  metadataSummaries: Array<Record<string, unknown>>;
  invoiceXmlFiles: Record<string, string>;
  continuationPoints: ContinuationPoints;
}

export class IncrementalExportWorkflow {
  private readonly exports: InvoiceExportWorkflow;

  constructor(exportsWorkflow: InvoiceExportWorkflow) {
    this.exports = exportsWorkflow;
  }

  async run(options: IncrementalExportOptions): Promise<IncrementalExportResult> {
    const referenceNumbers: string[] = [];
    const combinedXmlFiles: Record<string, string> = {};
    const combinedMetadata: Array<Record<string, unknown>> = [];

    const maxIterations = options.maxIterations ?? 20;
    let effectiveFrom = getEffectiveStartDate(
      options.continuationPoints,
      options.subjectType,
      options.windowFrom,
    );

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const filters =
        options.filtersFactory?.(effectiveFrom, options.windowTo) ??
        ({
          subjectType: options.subjectType,
          dateRange: {
            dateType: "PermanentStorage",
            from: effectiveFrom,
            to: options.windowTo,
          },
        } as unknown as InvoiceQueryFilters);

      const started = await this.exports.startExport({ filters });
      referenceNumbers.push(started.referenceNumber);

      const waitOptions = {
        ...(options.pollIntervalMs !== undefined && {
          pollIntervalMs: options.pollIntervalMs,
        }),
        ...(options.maxAttempts !== undefined && {
          maxAttempts: options.maxAttempts,
        }),
      };
      const status = await this.exports.waitForExport(started.referenceNumber, waitOptions);

      const processed = await this.exports.downloadAndProcessPackage(
        status,
        started.encryptionData,
        {
          ...(options.verifyHashes !== undefined && {
            verifyHashes: options.verifyHashes,
          }),
        },
      );

      combinedMetadata.push(...processed.metadataSummaries);
      for (const [name, content] of Object.entries(processed.invoiceXmlFiles)) {
        combinedXmlFiles[name] = content;
      }

      updateContinuationPoint(
        options.continuationPoints,
        options.subjectType,
        status.package ?? {},
      );

      const nextFrom = getEffectiveStartDate(
        options.continuationPoints,
        options.subjectType,
        options.windowFrom,
      );
      if (nextFrom === effectiveFrom) {
        break;
      }
      effectiveFrom = nextFrom;
    }

    const deduped = dedupeByKsefNumber(combinedMetadata);
    return {
      referenceNumbers,
      metadataSummaries: Object.values(deduped),
      invoiceXmlFiles: combinedXmlFiles,
      continuationPoints: options.continuationPoints,
    };
  }
}
