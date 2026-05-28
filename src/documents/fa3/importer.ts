import fs from "node:fs";
import path from "node:path";
import { FA3BatchDraft, FA3Draft } from "./builder";
import type { FA3DraftInput, FA3ValidationIssue } from "./types";

export const ImportMode = {
  NORMAL: "normal",
  VALIDATE_ONLY: "validate_only",
  FAIL_FAST: "fail_fast",
} as const;

export type ImportModeValue = (typeof ImportMode)[keyof typeof ImportMode];

export class FA3InvalidRow {
  readonly rowNumber: number | undefined;
  readonly invoiceNumber: string | undefined;
  readonly message: string;

  constructor(message: string, rowNumber?: number, invoiceNumber?: string) {
    this.message = message;
    this.rowNumber = rowNumber;
    this.invoiceNumber = invoiceNumber;
  }
}

export class FA3ImportResult {
  readonly validDrafts: FA3Draft[];
  readonly invalidRows: FA3InvalidRow[];
  readonly errors: FA3ValidationIssue[];
  readonly warnings: FA3ValidationIssue[];

  constructor(value: {
    validDrafts?: FA3Draft[];
    invalidRows?: FA3InvalidRow[];
    errors?: FA3ValidationIssue[];
    warnings?: FA3ValidationIssue[];
  } = {}) {
    this.validDrafts = [...(value.validDrafts ?? [])];
    this.invalidRows = [...(value.invalidRows ?? [])];
    this.errors = [...(value.errors ?? [])];
    this.warnings = [...(value.warnings ?? [])];
  }
}

export class FA3ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FA3ImportError";
  }
}

function toIssue(message: string): FA3ValidationIssue {
  return {
    code: "import_error",
    message,
  };
}

function loadPayload(source: string | Record<string, unknown>): unknown {
  if (typeof source !== "string") {
    return source;
  }
  const resolved = path.resolve(source);
  if (fs.existsSync(resolved)) {
    return JSON.parse(fs.readFileSync(resolved, "utf8"));
  }
  return JSON.parse(source);
}

function draftRows(payload: unknown): FA3DraftInput[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const raw = payload as Record<string, unknown>;
  const rows = raw.drafts ?? raw.faktury;
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows as FA3DraftInput[];
}

export class FA3Importer {
  static fromJson(
    source: string | Record<string, unknown>,
    options: { mode?: ImportModeValue } = {},
  ): FA3ImportResult {
    const mode = options.mode ?? ImportMode.NORMAL;
    let payload: unknown;
    try {
      payload = loadPayload(source);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (mode === ImportMode.FAIL_FAST) {
        throw new FA3ImportError(`Nie można odczytać JSON: ${message}`);
      }
      return new FA3ImportResult({
        validDrafts: [],
        invalidRows: [new FA3InvalidRow(`Nie można odczytać JSON: ${message}`)],
        errors: [toIssue(`Nie można odczytać JSON: ${message}`)],
        warnings: [],
      });
    }

    const rows = draftRows(payload);
    if (rows.length === 0) {
      const message = "JSON draft jest nieprawidłowy: oczekiwano pola drafts lub faktury.";
      if (mode === ImportMode.FAIL_FAST) {
        throw new FA3ImportError(message);
      }
      return new FA3ImportResult({
        validDrafts: [],
        invalidRows: [new FA3InvalidRow(message)],
        errors: [toIssue(message)],
        warnings: [],
      });
    }

    const validDrafts: FA3Draft[] = [];
    const invalidRows: FA3InvalidRow[] = [];
    const errors: FA3ValidationIssue[] = [];
    for (const [index, row] of rows.entries()) {
      try {
        const draft = FA3Draft.fromDict(row);
        const issues = draft.validate();
        if (issues.length > 0) {
          const message = issues.map((item) => item.message).join(" ");
          if (mode === ImportMode.FAIL_FAST) {
            throw new FA3ImportError(message);
          }
          invalidRows.push(new FA3InvalidRow(message, index + 1, draft.toDict().invoiceNumber));
          errors.push(...issues);
          continue;
        }
        if (mode !== ImportMode.VALIDATE_ONLY) {
          validDrafts.push(draft);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (mode === ImportMode.FAIL_FAST) {
          throw new FA3ImportError(message);
        }
        invalidRows.push(new FA3InvalidRow(message, index + 1));
        errors.push(toIssue(message));
      }
    }

    return new FA3ImportResult({ validDrafts, invalidRows, errors, warnings: [] });
  }

  static fromXlsx(): never {
    throw new FA3ImportError(
      "Import XLSX nie jest jeszcze dostępny w TypeScript SDK. Użyj importu JSON.",
    );
  }

  static from_json(
    source: string | Record<string, unknown>,
    options: { mode?: ImportModeValue } = {},
  ): FA3ImportResult {
    return FA3Importer.fromJson(source, options);
  }
}

export function toBatchDraft(result: FA3ImportResult): FA3BatchDraft {
  return new FA3BatchDraft(result.validDrafts);
}
