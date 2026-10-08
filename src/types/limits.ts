import { JsonObject } from "./common";
import type { EffectiveApiRateLimits } from "./openapi.generated";

export type LimitsContextResponse = JsonObject;
export type LimitsSubjectResponse = JsonObject;
export type RateLimitsResponse = EffectiveApiRateLimits;
export type LimitsChangeRequest = JsonObject;
