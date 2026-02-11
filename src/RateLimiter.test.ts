import { RateLimiter } from './RateLimiter';

describe('RateLimiter', () => {
  it('allows requests up to token limit', async () => {
    const limiter = new RateLimiter({
      tokensPerInterval: 3,
      intervalMs: 60000
    });
    
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false); // Out of tokens
  });

  it('enforces minimum delay between requests', async () => {
    const limiter = new RateLimiter({
      tokensPerInterval: 10,
      intervalMs: 60000,
      minDelayMs: 100
    });
    
    const start = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    
    // Should take at least minDelayMs
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });

  it('refills tokens over time', async () => {
    const limiter = new RateLimiter({
      tokensPerInterval: 2,
      intervalMs: 200
    });
    
    // Consume all tokens
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(true);
    expect(limiter.tryAcquire()).toBe(false);
    
    // Wait for refill
    await new Promise(resolve => setTimeout(resolve, 250));
    
    // Should have tokens again
    expect(limiter.tryAcquire()).toBe(true);
  });

  it('blocks until tokens are available with acquire()', async () => {
    const limiter = new RateLimiter({
      tokensPerInterval: 1,
      intervalMs: 200
    });
    
    const start = Date.now();
    
    await limiter.acquire(); // Immediate
    await limiter.acquire(); // Should wait ~200ms
    
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(200);
  }, 10000);
});
