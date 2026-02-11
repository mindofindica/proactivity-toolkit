import { StateManager } from './StateManager';

export interface HeartbeatState {
  lastChecks: Record<string, number>;
}

export interface CheckConfig {
  /**
   * Unique identifier for this check (e.g., 'email', 'calendar')
   */
  id: string;
  
  /**
   * Minimum interval between checks in milliseconds
   */
  intervalMs: number;
  
  /**
   * Function that performs the check. Returns true if something needs attention.
   */
  check: () => Promise<boolean>;
  
  /**
   * Optional: custom message when check triggers
   */
  message?: string;
}

/**
 * Manages periodic checks with intelligent scheduling and state persistence.
 * 
 * Example:
 * ```typescript
 * const heartbeat = new HeartbeatManager('/tmp/heartbeat-state.json');
 * 
 * const checks: CheckConfig[] = [
 *   {
 *     id: 'email',
 *     intervalMs: 30 * 60 * 1000, // 30 min
 *     check: async () => {
 *       const unread = await getUnreadCount();
 *       return unread > 0;
 *     },
 *     message: 'You have new emails!'
 *   }
 * ];
 * 
 * const alerts = await heartbeat.run(checks);
 * if (alerts.length === 0) {
 *   console.log('HEARTBEAT_OK');
 * } else {
 *   alerts.forEach(a => console.log(a));
 * }
 * ```
 */
export class HeartbeatManager {
  private state: StateManager<HeartbeatState>;

  constructor(statePath: string) {
    this.state = new StateManager<HeartbeatState>(statePath, {
      lastChecks: {}
    });
  }

  /**
   * Run checks that are due, respecting intervals.
   * Returns array of alert messages (empty if nothing needs attention).
   */
  async run(checks: CheckConfig[]): Promise<string[]> {
    const state = await this.state.get();
    const now = Date.now();
    const alerts: string[] = [];

    for (const config of checks) {
      const lastCheck = state.lastChecks[config.id] || 0;
      const elapsed = now - lastCheck;

      // Skip if not enough time has passed
      if (elapsed < config.intervalMs) {
        continue;
      }

      try {
        const needsAttention = await config.check();
        
        // Update state regardless of result
        await this.state.update(s => ({
          ...s,
          lastChecks: {
            ...s.lastChecks,
            [config.id]: now
          }
        }));

        if (needsAttention) {
          alerts.push(config.message || `Check '${config.id}' needs attention`);
        }
      } catch (err) {
        console.error(`Heartbeat check '${config.id}' failed:`, err);
        // Don't update lastCheck on failure so we retry next time
      }
    }

    return alerts;
  }

  /**
   * Force a check to run on next heartbeat (reset its timer).
   */
  async resetCheck(id: string): Promise<void> {
    await this.state.update(s => ({
      ...s,
      lastChecks: {
        ...s.lastChecks,
        [id]: 0
      }
    }));
  }

  /**
   * Get time until next check is due.
   */
  async getNextCheckTime(id: string, intervalMs: number): Promise<number | null> {
    const state = await this.state.get();
    const lastCheck = state.lastChecks[id];
    
    if (!lastCheck) {
      return 0; // Never run, due now
    }

    const elapsed = Date.now() - lastCheck;
    const remaining = intervalMs - elapsed;
    
    return remaining > 0 ? remaining : 0;
  }
}
