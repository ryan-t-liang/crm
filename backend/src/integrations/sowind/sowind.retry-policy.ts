import type { GatewayDeliveryResult } from "./sowind.types.js";

export type RetryDecision = { retry: boolean; deadLetter: boolean; delayMs: number | null };

export function retryDecision(result: GatewayDeliveryResult, attemptNumber: number, maxAttempts: number): RetryDecision {
  if (result.ok) return { retry: false, deadLetter: false, delayMs: null };
  if (!result.retryable || result.permanent) return { retry: false, deadLetter: result.permanent, delayMs: null };
  if (attemptNumber >= maxAttempts) return { retry: false, deadLetter: true, delayMs: null };
  const delayMs = result.retryAfterSeconds
    ? result.retryAfterSeconds * 1000
    : 1000 * (2 ** Math.max(0, attemptNumber - 1));
  return { retry: true, deadLetter: false, delayMs };
}

export class MinuteRateLimiter {
  private timestamps: number[] = [];
  constructor(private readonly maxPerMinute: number, private readonly now: () => number = Date.now) {}

  tryAcquire(): boolean {
    const threshold = this.now() - 60_000;
    this.timestamps = this.timestamps.filter((time) => time > threshold);
    if (this.timestamps.length >= this.maxPerMinute) return false;
    this.timestamps.push(this.now());
    return true;
  }

  availableInMs(): number {
    const threshold = this.now() - 60_000;
    this.timestamps = this.timestamps.filter((time) => time > threshold);
    if (this.timestamps.length < this.maxPerMinute) return 0;
    return Math.max(0, this.timestamps[0]! + 60_000 - this.now());
  }
}
