import type { OnlineSessionFormCode } from "../index";

const FORM_CODE_MAP: Record<string, OnlineSessionFormCode> = {
  FA2: {
    systemCode: "FA (2)",
    schemaVersion: "1-0E",
    value: "FA",
  },
  FA3: {
    systemCode: "FA (3)",
    schemaVersion: "1-0E",
    value: "FA",
  },
  PEF3: {
    systemCode: "PEF (3)",
    schemaVersion: "2-1",
    value: "PEF",
  },
  PEFKOR3: {
    systemCode: "PEF_KOR (3)",
    schemaVersion: "2-1",
    value: "PEF",
  },
  FARR1: {
    systemCode: "FA_RR (1)",
    schemaVersion: "1-1E",
    value: "FA_RR",
  },
};

export function parseFormCode(value?: string): OnlineSessionFormCode {
  const key = value?.trim().toUpperCase() ?? "FA3";
  const formCode = FORM_CODE_MAP[key];
  if (!formCode) {
    throw new Error(`Unsupported form code "${value}". Allowed: ${Object.keys(FORM_CODE_MAP).join(", ")}.`);
  }
  return formCode;
}
