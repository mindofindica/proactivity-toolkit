/**
 * Token bucket rate limiter for API calls.
 * 
 * Example:
 * ```typescript
 * const limiter = new RateLimiter({
 *   tokensPerInterval: 10,
 *   intervalMs: 60000, // 10 requests per minute
 *   minDelayMs: 3000   // 3s minimum between requests
 * });
 * 
 * // Wait for permission before making request
 * await limiter.acquire();
 * const data = await apiCall();
 * ```
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private lastAcquire: number = 0;
  
  constructor(
    private readonly config: {
      tokensPerInterval: number;
      intervalMs: number;
      minDelayMs?: number;
    }
  ) {
    this.tokens = config.tokensPerInterval;
    this.lastRefill = Date.now();
  }

  /**
   * Wait until a token is available, then consume it.
   */
  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      
      // Enforce minimum delay between requests
      if (this.config.minDelayMs) {
        const timeSinceLastAcquire = Date.now() - this.lastAcquire;
        if (timeSinceLastAcquire < this.config.minDelayMs) {
          await this.sleep(this.config.minDelayMs - timeSinceLastAcquire);
          continue;
        }
      }
      
      if (this.tokens >= 1) {
        this.tokens -= 1;
        this.lastAcquire = Date.now();
        return;
      }
      
      // Wait until next refill
      const timeUntilRefill = this.config.intervalMs - (Date.now() - this.lastRefill);
      await this.sleep(Math.max(timeUntilRefill, 100));
    }
  }

  /**
   * Try to acquire without waiting. Returns true if successful.
   */
  tryAcquire(): boolean {
    this.refill();
    
    if (this.tokens >= 1) {
      // Check minimum delay
      if (this.config.minDelayMs) {
        const timeSinceLastAcquire = Date.now() - this.lastAcquire;
        if (timeSinceLastAcquire < this.config.minDelayMs) {
          return false;
        }
      }
      
      this.tokens -= 1;
      this.lastAcquire = Date.now();
      return true;
    }
    
    return false;
  }

  /**
   * Get current number of available tokens.
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    
    if (elapsed >= this.config.intervalMs) {
      const intervals = Math.floor(elapsed / this.config.intervalMs);
      this.tokens = Math.min(
        this.config.tokensPerInterval,
        this.tokens + (intervals * this.config.tokensPerInterval)
      );
      this.lastRefill = now;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
