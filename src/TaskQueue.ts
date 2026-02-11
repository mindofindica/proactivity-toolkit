/**
 * Simple in-memory task queue with concurrency control.
 * Useful for batching operations that need rate limiting.
 * 
 * Example:
 * ```typescript
 * const queue = new TaskQueue({ concurrency: 2, delayMs: 1000 });
 * 
 * // Add tasks
 * const results = await Promise.all([
 *   queue.add(() => fetchPaper('id1')),
 *   queue.add(() => fetchPaper('id2')),
 *   queue.add(() => fetchPaper('id3'))
 * ]);
 * ```
 */
export class TaskQueue {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private concurrency: number;
  private delayMs: number;

  constructor(options: { concurrency?: number; delayMs?: number } = {}) {
    this.concurrency = options.concurrency || 1;
    this.delayMs = options.delayMs || 0;
  }

  /**
   * Add a task to the queue. Returns a promise that resolves when the task completes.
   */
  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift();

    if (task) {
      await task();
      
      if (this.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }
      
      this.running--;
      this.process();
    } else {
      this.running--;
    }
  }

  /**
   * Wait for all queued tasks to complete.
   */
  async drain(): Promise<void> {
    while (this.queue.length > 0 || this.running > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Get current queue size.
   */
  size(): number {
    return this.queue.length;
  }
}
