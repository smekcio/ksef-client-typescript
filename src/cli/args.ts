export interface ParsedArgv {
  positionals: string[];
  options: Record<string, string | boolean>;
  json: boolean;
  help: boolean;
}

const VALUE_OPTIONS = new Set<string>([
  "profile",
  "env",
  "lighthouse-env",
  "base-url",
  "context-type",
  "context-value",
  "token-store-policy",
  "token-store",
  "token-file",
  "access-token-env",
  "refresh-token-env",
  "ksef-token-env",
  "token",
  "page-size",
  "ksef-number",
  "output",
  "filters-file",
  "page-offset",
  "sort-order",
  "invoice-file",
  "form-code",
  "poll-interval-ms",
  "max-attempts",
  "hash-of-corrected-invoice",
  "upo-output",
  "session-ref",
  "invoice-ref",
  "upo-ref",
  "out-dir",
]);

export function parseArgv(argv: string[]): ParsedArgv {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token === undefined) {
      break;
    }
    if (token === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (token.startsWith("--")) {
      const equalIndex = token.indexOf("=");
      if (equalIndex > 2) {
        const key = token.slice(2, equalIndex);
        const value = token.slice(equalIndex + 1);
        options[key] = value;
        i += 1;
        continue;
      }

      const key = token.slice(2);
      const next = argv[i + 1];
      if (VALUE_OPTIONS.has(key) && next !== undefined && !next.startsWith("-")) {
        options[key] = next;
        i += 2;
        continue;
      }
      options[key] = true;
      i += 1;
      continue;
    }

    if (token === "-h") {
      options.help = true;
      i += 1;
      continue;
    }

    positionals.push(token);
    i += 1;
  }

  return {
    positionals,
    options,
    json: getBooleanOption(options, "json"),
    help: getBooleanOption(options, "help"),
  };
}

export function getStringOption(
  options: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

export function getBooleanOption(
  options: Record<string, string | boolean>,
  key: string,
): boolean {
  const value = options[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "false" || value === "0") {
      return false;
    }
    return value.length > 0;
  }
  return false;
}

export function getNumberOption(
  options: Record<string, string | boolean>,
  key: string,
): number | undefined {
  const value = getStringOption(options, key);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
