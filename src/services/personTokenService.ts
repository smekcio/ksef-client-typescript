import { fromBase64Url } from "../utils/base64url";

export interface PersonToken {
  issuer: string | null;
  audiences: string[];
  issuedAt: Date | null;
  expiresAt: Date | null;
  roles: string[];
  tokenType: string | null;
  contextIdType: string | null;
  contextIdValue: string | null;
  authMethod: string | null;
  authRequestNumber: string | null;
  subjectDetails: Record<string, unknown> | null;
  permissions: string[];
  permissionsExcluded: string[];
  rolesRaw: string[];
  permissionsEffective: string[];
  ipPolicy: Record<string, unknown> | null;
}

export class PersonTokenService {
  parse(jwtToken: string): PersonToken {
    const [, payload] = splitJwt(jwtToken);
    const claims = JSON.parse(payload) as Record<string, unknown>;

    const get = (name: string): string | null => {
      for (const [key, value] of Object.entries(claims)) {
        if (key.toLowerCase() === name.toLowerCase()) {
          return value ? String(value) : null;
        }
      }
      return null;
    };

    const getMany = (...names: string[]): string[] => {
      const values: string[] = [];
      for (const [key, value] of Object.entries(claims)) {
        if (names.some((name) => key.toLowerCase() === name.toLowerCase())) {
          if (Array.isArray(value)) {
            values.push(...value.map(String));
          } else if (value !== null && value !== undefined) {
            values.push(String(value));
          }
        }
      }
      return distinct(values);
    };

    const exp = unixToDate(claims.exp);
    const iat = unixToDate(claims.iat);

    const subjectDetails = tryParseJson(get("sud"));
    const ipPolicy = tryParseJson(get("ipp"));

    const permissions = parseJsonStringArray(get("per"));
    const permissionsExcluded = parseJsonStringArray(get("pec"));
    const rolesRaw = parseJsonStringArray(get("rol"));
    const permissionsEffective = parseJsonStringArray(get("pep"));

    const classicRoles = getMany(
      "role",
      "roles",
      "permissions",
      "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
    );
    const unifiedRoles = distinct([...classicRoles, ...permissions, ...rolesRaw]);

    return {
      issuer: (claims.iss as string | undefined) ?? null,
      audiences: ensureList(claims.aud),
      issuedAt: iat,
      expiresAt: exp,
      roles: unifiedRoles,
      tokenType: get("typ"),
      contextIdType: get("cit"),
      contextIdValue: get("civ"),
      authMethod: get("aum"),
      authRequestNumber: get("arn"),
      subjectDetails,
      permissions,
      permissionsExcluded,
      rolesRaw,
      permissionsEffective,
      ipPolicy,
    };
  }
}

function splitJwt(token: string): [string, string, string] {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format.");
  }
  const headerPart = parts[0];
  const payloadPart = parts[1];
  const signaturePart = parts[2];
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new Error("Invalid JWT format.");
  }
  const header = fromBase64Url(headerPart).toString("utf8");
  const payload = fromBase64Url(payloadPart).toString("utf8");
  return [header, payload, signaturePart];
}

function unixToDate(value: unknown): Date | null {
  if (typeof value === "number") {
    return new Date(value * 1000);
  }
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return new Date(Number(value) * 1000);
  }
  return null;
}

function tryParseJson(value: string | null): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(unwrapQuotedJson(value)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseJsonStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(unwrapQuotedJson(value));
    if (Array.isArray(parsed)) {
      return distinct(parsed.map(String).filter((item) => item.trim() !== ""));
    }
  } catch {
    // ignore
  }
  if (value.includes(",")) {
    return distinct(
      value
        .split(",")
        .map((item) => item.trim().replace(/^"|"$/g, ""))
        .filter((item) => item !== ""),
    );
  }
  return [value.replace(/^"|"$/g, "")];
}

function unwrapQuotedJson(value: string): string {
  if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value;
    }
  }
  return value;
}

function distinct(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function ensureList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [String(value)];
}
