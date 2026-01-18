export interface PublicKeyCertificate {
  certificate: string;
  validFrom: string;
  validTo: string;
  usage: Array<"KsefTokenEncryption" | "SymmetricKeyEncryption">;
}
