// Notion allows roughly 3 requests per second averaged over time. A full sync
// is about 11 requests, so pacing costs ~3 seconds and keeps the client from
// tripping 429s in the first place.
export class RateLimiter {
  private nextSlot = 0;
  private readonly minimumIntervalMs: number;

  constructor(
    requestsPerSecond = 3,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {
    this.minimumIntervalMs = 1000 / requestsPerSecond;
  }

  // The slot is reserved synchronously, before awaiting, so concurrent
  // callers can't all read the same stale slot and fire together (the
  // reentrancy bug the iOS RateLimiter's comment warns about).
  async waitForTurn(): Promise<void> {
    const now = this.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.minimumIntervalMs;
    const wait = slot - now;
    if (wait > 0) await this.sleep(wait);
  }
}
