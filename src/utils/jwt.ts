import { fromBase64Url } from "./base64url";

export interface JwtPayload {
  exp?: number;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split(".");
  const payloadPart = parts[1];
  if (parts.length < 2 || !payloadPart) {
    return null;
  }
  try {
    const payload = fromBase64Url(payloadPart).toString("utf8");
    return JSON.parse(payload) as JwtPayload;
  } catch {
    return null;
  }
}

export function getJwtExpiryMs(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) {
    return null;
  }
  return payload.exp * 1000;
}
