import { StateManager } from './StateManager';
import { unlink } from 'fs/promises';

describe('StateManager', () => {
  const testPath = '/tmp/test-state.json';
  
  afterEach(async () => {
    try {
      await unlink(testPath);
    } catch {}
  });

  it('returns defaults when file does not exist', async () => {
    const state = new StateManager(testPath, { count: 0 });
    const current = await state.get();
    expect(current).toEqual({ count: 0 });
  });

  it('persists and retrieves state', async () => {
    const state = new StateManager(testPath, { count: 0 });
    
    await state.set({ count: 42 });
    const retrieved = await state.get();
    
    expect(retrieved).toEqual({ count: 42 });
  });

  it('updates state via mutation function', async () => {
    const state = new StateManager(testPath, { count: 0 });
    
    await state.set({ count: 10 });
    await state.update(s => ({ count: s.count + 5 }));
    
    const result = await state.get();
    expect(result.count).toBe(15);
  });

  it('clears state to defaults', async () => {
    const state = new StateManager(testPath, { count: 0, name: 'test' });
    
    await state.set({ count: 42, name: 'modified' });
    await state.clear();
    
    const result = await state.get();
    expect(result).toEqual({ count: 0, name: 'test' });
  });

  it('merges defaults with stored state', async () => {
    const state = new StateManager(testPath, { a: 1, b: 2 });
    
    await state.set({ a: 99 } as any);
    const result = await state.get();
    
    // Should merge: stored 'a' overrides default, missing 'b' comes from defaults
    expect(result.a).toBe(99);
    expect(result.b).toBe(2);
  });
});
