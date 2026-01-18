const AUTH_NS = "http://ksef.mf.gov.pl/auth/token/2.0";

export interface AuthTokenRequestXmlOptions {
  challenge: string;
  contextIdentifierType: string;
  contextIdentifierValue: string;
  subjectIdentifierType?: string;
  authorizationPolicyXml?: string | null;
}

export function buildAuthTokenRequestXml(options: AuthTokenRequestXmlOptions): string {
  const contextTag = normalizeContextIdentifierType(options.contextIdentifierType);
  const authorizationPolicy = options.authorizationPolicyXml
    ? `\n  ${options.authorizationPolicyXml}`
    : "";
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    `<AuthTokenRequest xmlns="${AUTH_NS}">\n` +
    `  <Challenge>${options.challenge}</Challenge>\n` +
    "  <ContextIdentifier>\n" +
    `    <${contextTag}>${options.contextIdentifierValue}</${contextTag}>\n` +
    "  </ContextIdentifier>\n" +
    `  <SubjectIdentifierType>${
      options.subjectIdentifierType ?? "certificateSubject"
    }</SubjectIdentifierType>${authorizationPolicy}\n` +
    "</AuthTokenRequest>"
  );
}

export function normalizeContextIdentifierType(value: string): string {
  const key = value.trim().toLowerCase();
  if (key === "nip") {
    return "Nip";
  }
  if (key === "internalid") {
    return "InternalId";
  }
  if (key === "nipvatue") {
    return "NipVatUe";
  }
  if (key === "peppolid") {
    return "PeppolId";
  }
  throw new Error("Unsupported context identifier type");
}
