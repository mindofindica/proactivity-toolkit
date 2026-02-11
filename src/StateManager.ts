import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

/**
 * Generic JSON state persistence with atomic writes and type safety.
 * 
 * Example:
 * ```typescript
 * interface MyState {
 *   lastCheck: number;
 *   items: string[];
 * }
 * 
 * const state = new StateManager<MyState>('/tmp/my-state.json', {
 *   lastCheck: 0,
 *   items: []
 * });
 * 
 * await state.update(s => ({ ...s, lastCheck: Date.now() }));
 * const current = await state.get();
 * ```
 */
export class StateManager<T> {
  constructor(
    private readonly path: string,
    private readonly defaults: T
  ) {}

  /**
   * Read current state, returning defaults if file doesn't exist.
   */
  async get(): Promise<T> {
    try {
      const content = await readFile(this.path, 'utf-8');
      return { ...this.defaults, ...JSON.parse(content) };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return { ...this.defaults };
      }
      throw err;
    }
  }

  /**
   * Write new state atomically (write to temp, then rename).
   */
  async set(state: T): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tempPath = `${this.path}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    await writeFile(this.path, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Update state via mutation function.
   */
  async update(fn: (current: T) => T): Promise<void> {
    const current = await this.get();
    const updated = fn(current);
    await this.set(updated);
  }

  /**
   * Clear state (reset to defaults).
   */
  async clear(): Promise<void> {
    await this.set({ ...this.defaults });
  }
}
