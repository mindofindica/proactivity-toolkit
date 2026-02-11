import { HeartbeatManager, CheckConfig } from './HeartbeatManager';
import { unlink } from 'fs/promises';

describe('HeartbeatManager', () => {
  const testPath = '/tmp/test-heartbeat.json';
  
  afterEach(async () => {
    try {
      await unlink(testPath);
    } catch {}
  });

  it('runs checks that are due', async () => {
    const manager = new HeartbeatManager(testPath);
    let checkCalled = false;
    
    const checks: CheckConfig[] = [
      {
        id: 'test',
        intervalMs: 100,
        check: async () => {
          checkCalled = true;
          return false;
        }
      }
    ];
    
    await manager.run(checks);
    expect(checkCalled).toBe(true);
  });

  it('respects check intervals', async () => {
    const manager = new HeartbeatManager(testPath);
    let callCount = 0;
    
    const checks: CheckConfig[] = [
      {
        id: 'test',
        intervalMs: 1000, // 1 second
        check: async () => {
          callCount++;
          return false;
        }
      }
    ];
    
    await manager.run(checks); // First run
    expect(callCount).toBe(1);
    
    await manager.run(checks); // Should skip (too soon)
    expect(callCount).toBe(1);
    
    // Wait for interval to pass
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    await manager.run(checks); // Should run again
    expect(callCount).toBe(2);
  });

  it('returns alerts when checks need attention', async () => {
    const manager = new HeartbeatManager(testPath);
    
    const checks: CheckConfig[] = [
      {
        id: 'test',
        intervalMs: 100,
        check: async () => true,
        message: 'Alert!'
      }
    ];
    
    const alerts = await manager.run(checks);
    expect(alerts).toEqual(['Alert!']);
  });

  it('returns empty array when nothing needs attention', async () => {
    const manager = new HeartbeatManager(testPath);
    
    const checks: CheckConfig[] = [
      {
        id: 'test',
        intervalMs: 100,
        check: async () => false
      }
    ];
    
    const alerts = await manager.run(checks);
    expect(alerts).toEqual([]);
  });

  it('resets check timer on demand', async () => {
    const manager = new HeartbeatManager(testPath);
    let callCount = 0;
    
    const checks: CheckConfig[] = [
      {
        id: 'test',
        intervalMs: 10000, // 10 seconds
        check: async () => {
          callCount++;
          return false;
        }
      }
    ];
    
    await manager.run(checks);
    expect(callCount).toBe(1);
    
    // Reset timer
    await manager.resetCheck('test');
    
    // Should run immediately despite short elapsed time
    await manager.run(checks);
    expect(callCount).toBe(2);
  });
});
