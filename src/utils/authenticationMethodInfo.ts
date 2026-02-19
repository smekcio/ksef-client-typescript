import {
  AuthenticationListItem,
  AuthenticationListResponse,
  AuthenticationMethod,
  AuthenticationMethodCategory,
  AuthenticationMethodInfo,
  AuthenticationOperationStatusResponse,
} from "../types/common";

const AUTHENTICATION_METHOD_CATEGORIES: ReadonlySet<AuthenticationMethodCategory> = new Set([
  "XadesSignature",
  "NationalNode",
  "Token",
  "Other",
]);

const LEGACY_METHOD_INFO_FALLBACKS: Record<AuthenticationMethod, AuthenticationMethodInfo> = {
  Token: {
    category: "Token",
    code: "Token",
    displayName: "Token KSeF",
  },
  TrustedProfile: {
    category: "NationalNode",
    code: "TrustedProfile",
    displayName: "Profil Zaufany / Węzeł Krajowy",
  },
  InternalCertificate: {
    category: "Other",
    code: "InternalCertificate",
    displayName: "Certyfikat KSeF",
  },
  QualifiedSignature: {
    category: "Other",
    code: "QualifiedSignature",
    displayName: "Podpis kwalifikowany",
  },
  QualifiedSeal: {
    category: "Other",
    code: "QualifiedSeal",
    displayName: "Pieczęć kwalifikowana",
  },
  PersonalSignature: {
    category: "Other",
    code: "PersonalSignature",
    displayName: "Podpis osobisty",
  },
  PeppolSignature: {
    category: "Other",
    code: "PeppolSignature",
    displayName: "Podpis dostawcy usług Peppol",
  },
};

export function normalizeAuthenticationOperationStatusResponse(
  response: AuthenticationOperationStatusResponse,
): AuthenticationOperationStatusResponse {
  return {
    ...response,
    authenticationMethodInfo: ensureAuthenticationMethodInfo(
      response.authenticationMethodInfo,
      response.authenticationMethod,
    ),
  };
}

export function normalizeAuthenticationListResponse(
  response: AuthenticationListResponse,
): AuthenticationListResponse {
  const items = Array.isArray(response.items) ? response.items : [];
  return {
    ...response,
    items: items.map(normalizeAuthenticationListItem),
  };
}

function normalizeAuthenticationListItem(item: AuthenticationListItem): AuthenticationListItem {
  return {
    ...item,
    authenticationMethodInfo: ensureAuthenticationMethodInfo(
      item.authenticationMethodInfo,
      item.authenticationMethod,
    ),
  };
}

function ensureAuthenticationMethodInfo(
  value: AuthenticationMethodInfo | null | undefined,
  authenticationMethod: AuthenticationMethod | string | undefined,
): AuthenticationMethodInfo {
  const fallback = getFallbackForMethod(authenticationMethod);
  const category = resolveCategory(value?.category, fallback.category);
  const code = resolveString(value?.code, fallback.code);
  const displayName = resolveString(value?.displayName, fallback.displayName);
  return { category, code, displayName };
}

function getFallbackForMethod(
  authenticationMethod: AuthenticationMethod | string | undefined,
): AuthenticationMethodInfo {
  if (
    authenticationMethod &&
    Object.prototype.hasOwnProperty.call(LEGACY_METHOD_INFO_FALLBACKS, authenticationMethod)
  ) {
    return LEGACY_METHOD_INFO_FALLBACKS[authenticationMethod as AuthenticationMethod];
  }
  const fallbackCode = resolveString(authenticationMethod, "Unknown");
  return {
    category: "Other",
    code: fallbackCode,
    displayName: fallbackCode,
  };
}

function resolveCategory(
  value: AuthenticationMethodCategory | undefined,
  fallback: AuthenticationMethodCategory,
): AuthenticationMethodCategory {
  if (value && AUTHENTICATION_METHOD_CATEGORIES.has(value)) {
    return value;
  }
  return fallback;
}

function resolveString(value: string | undefined, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return fallback;
}
