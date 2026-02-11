import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';

/**
 * Helpers for managing daily memory files (memory/YYYY-MM-DD.md pattern).
 * 
 * Example:
 * ```typescript
 * const memory = new MemoryFile('/root/.openclaw/workspace/memory');
 * 
 * // Append to today's log
 * await memory.append('Completed gap detector proposal');
 * 
 * // Read yesterday's notes
 * const yesterday = await memory.read(-1);
 * 
 * // Get recent context (today + yesterday)
 * const context = await memory.getRecentContext(2);
 * ```
 */
export class MemoryFile {
  constructor(private readonly memoryDir: string) {}

  /**
   * Get the file path for a given date offset.
   * offset = 0: today, -1: yesterday, 1: tomorrow
   */
  getPath(offset: number = 0): string {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    const filename = date.toISOString().split('T')[0] + '.md';
    return join(this.memoryDir, filename);
  }

  /**
   * Check if a memory file exists.
   */
  async exists(offset: number = 0): Promise<boolean> {
    try {
      await access(this.getPath(offset));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read a memory file. Returns empty string if file doesn't exist.
   */
  async read(offset: number = 0): Promise<string> {
    try {
      return await readFile(this.getPath(offset), 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return '';
      }
      throw err;
    }
  }

  /**
   * Append content to a memory file (creates if doesn't exist).
   */
  async append(content: string, offset: number = 0): Promise<void> {
    const path = this.getPath(offset);
    await mkdir(dirname(path), { recursive: true });
    
    const existing = await this.read(offset);
    const timestamp = new Date().toISOString().slice(11, 19); // HH:MM:SS
    const entry = existing ? `\n\n## ${timestamp}\n\n${content}` : `# ${new Date().toISOString().split('T')[0]}\n\n## ${timestamp}\n\n${content}`;
    
    await writeFile(path, existing + entry, 'utf-8');
  }

  /**
   * Get recent context by reading multiple days.
   * Returns combined content from today back to N days ago.
   */
  async getRecentContext(days: number = 2): Promise<string> {
    const entries: string[] = [];
    
    for (let i = 0; i < days; i++) {
      const content = await this.read(-i);
      if (content) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${i} days ago`;
        entries.push(`## ${label} (${date.toISOString().split('T')[0]})\n\n${content}`);
      }
    }
    
    return entries.join('\n\n---\n\n');
  }

  /**
   * Create a new entry with a header.
   */
  async log(header: string, content: string, offset: number = 0): Promise<void> {
    await this.append(`### ${header}\n\n${content}`, offset);
  }
}
