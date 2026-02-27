import { isIP } from "node:net";
import { KsefValidationError } from "../errors/errors";

export interface PresignedUrlPolicyOptions {
  strictPresignedUrlValidation: boolean;
  allowedPresignedHosts?: string[];
  allowPrivateNetworkPresignedUrls: boolean;
}

export function validatePresignedUrlSecurity(
  options: PresignedUrlPolicyOptions,
  urlText: string,
): void {
  const parsed = parseUrl(urlText);
  const host = normalizeHost(parsed.hostname);
  if (!host) {
    throw new KsefValidationError("Rejected insecure presigned URL: host is missing.");
  }

  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new KsefValidationError(
      "Rejected insecure presigned URL: localhost hosts are not allowed for skipAuth requests.",
    );
  }

  if (options.strictPresignedUrlValidation && parsed.protocol !== "https:") {
    throw new KsefValidationError(
      "Rejected insecure presigned URL: https is required for skipAuth requests.",
    );
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    if (isLoopbackIpv4(host)) {
      throw new KsefValidationError(
        "Rejected insecure presigned URL: loopback addresses are not allowed for skipAuth requests.",
      );
    }
    if (
      !options.allowPrivateNetworkPresignedUrls &&
      (isPrivateIpv4(host) || isLinkLocalIpv4(host) || isReservedIpv4(host))
    ) {
      throw new KsefValidationError(
        "Rejected insecure presigned URL: private, link-local, and reserved IP hosts are blocked for skipAuth requests.",
      );
    }
  } else if (ipVersion === 6) {
    if (isLoopbackIpv6(host)) {
      throw new KsefValidationError(
        "Rejected insecure presigned URL: loopback addresses are not allowed for skipAuth requests.",
      );
    }
    if (
      !options.allowPrivateNetworkPresignedUrls &&
      (isPrivateIpv6(host) || isLinkLocalIpv6(host) || isReservedIpv6(host))
    ) {
      throw new KsefValidationError(
        "Rejected insecure presigned URL: private, link-local, and reserved IP hosts are blocked for skipAuth requests.",
      );
    }
  }

  const allowlist = (options.allowedPresignedHosts ?? [])
    .map((entry) => normalizeHost(entry))
    .filter((entry) => entry.length > 0);
  if (allowlist.length > 0 && !isHostAllowed(host, allowlist)) {
    throw new KsefValidationError(
      "Rejected insecure presigned URL: host is not in allowedPresignedHosts for skipAuth requests.",
    );
  }
}

function parseUrl(urlText: string): URL {
  try {
    return new URL(urlText);
  } catch {
    throw new KsefValidationError(`Rejected insecure presigned URL: invalid URL '${urlText}'.`);
  }
}

function normalizeHost(value: string): string {
  return value.toLowerCase().replace(/\.+$/, "");
}

function isHostAllowed(host: string, allowedHosts: string[]): boolean {
  for (const allowedHost of allowedHosts) {
    if (host === allowedHost) {
      return true;
    }
    if (isIP(allowedHost) === 0 && host.endsWith(`.${allowedHost}`)) {
      return true;
    }
  }
  return false;
}

function parseIpv4Octets(address: string): number[] {
  const octets = address.split(".").map((segment) => Number(segment));
  return octets.length === 4 ? octets : [];
}

function isLoopbackIpv4(address: string): boolean {
  const [a] = parseIpv4Octets(address);
  return a === 127;
}

function isPrivateIpv4(address: string): boolean {
  const [a, b] = parseIpv4Octets(address);
  return (
    a === 10 ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isLinkLocalIpv4(address: string): boolean {
  const [a, b] = parseIpv4Octets(address);
  return a === 169 && b === 254;
}

function isReservedIpv4(address: string): boolean {
  const [a, b, c] = parseIpv4Octets(address);
  if (a === undefined || b === undefined || c === undefined) {
    return false;
  }
  if (a === 0 || a >= 224) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a === 192 && b === 0 && c === 0) {
    return true;
  }
  if (a === 192 && b === 0 && c === 2) {
    return true;
  }
  if (a === 198 && (b === 18 || b === 19)) {
    return true;
  }
  if (a === 198 && b === 51 && c === 100) {
    return true;
  }
  if (a === 203 && b === 0 && c === 113) {
    return true;
  }
  return false;
}

function isLoopbackIpv6(address: string): boolean {
  return address === "::1";
}

function isPrivateIpv6(address: string): boolean {
  return address.startsWith("fc") || address.startsWith("fd");
}

function isLinkLocalIpv6(address: string): boolean {
  return /^fe[89ab]/.test(address);
}

function isReservedIpv6(address: string): boolean {
  return (
    address === "::" ||
    address.startsWith("ff") ||
    address.startsWith("2001:db8")
  );
}
