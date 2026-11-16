import { SetMetadata } from '@nestjs/common';

export interface RateLimitRule {
  /** Bucket name, e.g. 'leads' → key `leads:ip:<ip>`. */
  name: string;
  limit: number;
  windowSec: number;
  /** What the limit is counted per. 'body:<field>' counts per a request body value (e.g. OTP destination). */
  by: 'ip' | `body:${string}`;
  /** Deny when Redis is unreachable (auth/OTP), instead of letting the request through. */
  failClosed?: boolean;
}

export const RATE_LIMIT = 'nx:rateLimit';

/** One or more limits on a route; all must pass. Example: OTP send = 5/h per destination + 20/h per IP. */
export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT, rules);

/** Applied to every public GET without an explicit rule (docs/02 §1: 120/min/IP). */
export const DEFAULT_PUBLIC_GET: RateLimitRule = { name: 'public-get', limit: 120, windowSec: 60, by: 'ip' };
