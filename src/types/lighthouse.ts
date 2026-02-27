export type LighthouseMessageCategory = "FAILURE" | "TOTAL_FAILURE" | "MAINTENANCE";

export type LighthouseMessageType =
  | "FAILURE_START"
  | "FAILURE_END"
  | "MAINTENANCE_ANNOUNCEMENT";

export type LighthouseStatusCode = "AVAILABLE" | "MAINTENANCE" | "FAILURE" | "TOTAL_FAILURE";

export interface LighthouseMessage {
  id: string;
  eventId: number;
  category: LighthouseMessageCategory;
  type: LighthouseMessageType;
  title: string;
  text: string;
  start: string;
  end?: string;
  version: number;
  published: string;
}

export interface LighthouseStatusResponse {
  status: LighthouseStatusCode;
  messages?: LighthouseMessage[] | null;
}
