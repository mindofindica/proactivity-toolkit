# OpenClaw Integration Examples

This guide shows how to integrate proactivity-toolkit with OpenClaw agents.

## Table of Contents

1. [Heartbeat Integration](#heartbeat-integration)
2. [Memory Integration](#memory-integration)
3. [Cron Jobs](#cron-jobs)
4. [State Management](#state-management)
5. [Complete Example: Proactive Digest](#complete-example-proactive-digest)

---

## Heartbeat Integration

OpenClaw agents can respond to heartbeat polls with `HEARTBEAT_OK` when nothing needs attention, or return alerts when action is needed.

### Basic Heartbeat Handler

```typescript
// src/heartbeat.ts
import { HeartbeatManager, CheckConfig } from '@indica/proactivity-toolkit';

const manager = new HeartbeatManager('/root/.openclaw/state/heartbeat.json');

const checks: CheckConfig[] = [
  {
    id: 'inbox',
    intervalMs: 30 * 60 * 1000, // 30 min
    check: async () => {
      const unread = await checkUnreadEmails();
      return unread > 5; // Alert if more than 5 unread
    },
    message: 'Your inbox has 5+ unread emails'
  },
  {
    id: 'calendar',
    intervalMs: 60 * 60 * 1000, // 1 hour
    check: async () => {
      const upcoming = await getUpcomingEvents(120); // Next 2h
      return upcoming.length > 0;
    },
    message: 'You have events starting soon'
  }
];

async function handleHeartbeat(): Promise<string> {
  const alerts = await manager.run(checks);
  
  if (alerts.length === 0) {
    return 'HEARTBEAT_OK';
  }
  
  return alerts.join('\n\n');
}

// Export for OpenClaw command
export { handleHeartbeat };
```

### Using in HEARTBEAT.md

Add to your workspace `HEARTBEAT.md`:

```markdown
# Heartbeat Checklist

Run proactive checks:

1. Inbox - check for urgent emails (every 30 min)
2. Calendar - upcoming events (every hour)
3. GitHub - new issues/PRs (every 2 hours)

If nothing needs attention, reply HEARTBEAT_OK.
```

Then in your heartbeat handler:

```typescript
import { handleHeartbeat } from './src/heartbeat';

// When OpenClaw sends heartbeat poll:
const response = await handleHeartbeat();
console.log(response); // Either 'HEARTBEAT_OK' or alerts
```

---

## Memory Integration

Track your work in daily memory files that persist across sessions.

### Daily Logging

```typescript
import { MemoryFile } from '@indica/proactivity-toolkit';

const memory = new MemoryFile('/root/.openclaw/workspace/memory');

// Log completed work
await memory.log('Task Completed', 'Built proactivity-toolkit v0.1.0');

// Log decisions
await memory.log('Design Decision', `
Chose token bucket algorithm for rate limiting because:
- Handles burst traffic better than sliding window
- Simpler implementation
- Standard pattern used by most APIs
`);

// Log lessons learned
await memory.log('Lesson', 
  'Always check arXiv rate limits before batch downloading PDFs. ' +
  'Got temp-banned for 1 hour after 50 rapid requests.'
);
```

### Reading Context

```typescript
// Get recent context for summarization
const recentWork = await memory.getRecentContext(3); // Last 3 days

console.log('Recent work summary:', recentWork);
```

### Session Startup

Read recent memory to maintain continuity:

```typescript
// In your session initialization
async function loadContext() {
  const memory = new MemoryFile('/root/.openclaw/workspace/memory');
  
  // Read today + yesterday
  const context = await memory.getRecentContext(2);
  
  console.log('=== Recent Context ===');
  console.log(context);
  console.log('=====================\n');
}
```

---

## Cron Jobs

Schedule proactive tasks using OpenClaw's cron system.

### Nightly Summary Report

```typescript
// src/cron/nightly-summary.ts
import { MemoryFile } from '@indica/proactivity-toolkit';

export async function generateNightlySummary() {
  const memory = new MemoryFile('/root/.openclaw/workspace/memory');
  
  // Read today's memory
  const todayLog = await memory.read(0);
  
  // Extract key points (simple version - could use LLM)
  const lines = todayLog.split('\n');
  const taskLines = lines.filter(l => 
    l.includes('completed') || 
    l.includes('built') || 
    l.includes('deployed')
  );
  
  const summary = `
📊 Nightly Summary - ${new Date().toISOString().split('T')[0]}

Completed Tasks:
${taskLines.map(l => `- ${l.trim()}`).join('\n')}

Full log: memory/${new Date().toISOString().split('T')[0]}.md
  `.trim();
  
  return summary;
}
```

Schedule in OpenClaw:

```json
{
  "schedule": {
    "kind": "cron",
    "expr": "0 23 * * *",
    "tz": "Europe/Amsterdam"
  },
  "payload": {
    "kind": "agentTurn",
    "message": "Generate and send nightly summary report"
  },
  "sessionTarget": "isolated",
  "delivery": {
    "mode": "announce",
    "channel": "signal"
  }
}
```

---

## State Management

Persist agent state across restarts.

### Track Processing Status

```typescript
import { StateManager } from '@indica/proactivity-toolkit';

interface DigestState {
  lastRun: number;
  papersProcessed: string[];
  trackWeights: Record<string, number>;
}

const state = new StateManager<DigestState>(
  '/root/.openclaw/state/digest-state.json',
  {
    lastRun: 0,
    papersProcessed: [],
    trackWeights: {
      'llm-agents': 1.0,
      'rag': 1.0,
      'evaluation': 1.0
    }
  }
);

// Update after processing
async function processPapers(papers: Paper[]) {
  const current = await state.get();
  
  const newPapers = papers.filter(p => 
    !current.papersProcessed.includes(p.id)
  );
  
  // Process new papers...
  
  await state.update(s => ({
    ...s,
    lastRun: Date.now(),
    papersProcessed: [
      ...s.papersProcessed,
      ...newPapers.map(p => p.id)
    ].slice(-1000) // Keep last 1000
  }));
}
```

### Session Metadata

Track session statistics:

```typescript
interface SessionStats {
  startTime: number;
  tasksCompleted: number;
  errors: number;
  lastError: string | null;
}

const sessionState = new StateManager<SessionStats>(
  '/root/.openclaw/state/session.json',
  {
    startTime: Date.now(),
    tasksCompleted: 0,
    errors: 0,
    lastError: null
  }
);

// Increment on task completion
await sessionState.update(s => ({
  ...s,
  tasksCompleted: s.tasksCompleted + 1
}));
```

---

## Complete Example: Proactive Digest

A full implementation of a daily digest system with engagement tracking.

```typescript
import {
  StateManager,
  HeartbeatManager,
  MemoryFile,
  RateLimiter,
  TaskQueue
} from '@indica/proactivity-toolkit';

interface DigestState {
  lastDigestSent: number;
  papersShown: string[];
  engagementScores: Record<string, number>;
}

class ProactiveDigest {
  private state: StateManager<DigestState>;
  private heartbeat: HeartbeatManager;
  private memory: MemoryFile;
  private rateLimiter: RateLimiter;
  private queue: TaskQueue;

  constructor() {
    this.state = new StateManager('/root/.openclaw/state/digest.json', {
      lastDigestSent: 0,
      papersShown: [],
      engagementScores: {}
    });

    this.heartbeat = new HeartbeatManager('/root/.openclaw/state/digest-heartbeat.json');
    this.memory = new MemoryFile('/root/.openclaw/workspace/memory');
    
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 20,
      intervalMs: 60000,
      minDelayMs: 3000
    });

    this.queue = new TaskQueue({
      concurrency: 2,
      delayMs: 3000
    });
  }

  async fetchNewPapers(): Promise<Paper[]> {
    await this.rateLimiter.acquire();
    
    // Fetch from arXiv API
    const papers = await fetchArxivPapers();
    
    const state = await this.state.get();
    
    // Filter out already shown
    return papers.filter(p => !state.papersShown.includes(p.id));
  }

  async downloadPDFs(papers: Paper[]): Promise<void> {
    await Promise.all(
      papers.map(p => 
        this.queue.add(async () => {
          await this.rateLimiter.acquire();
          await downloadPDF(p.id);
        })
      )
    );
  }

  async generateDigest(): Promise<string> {
    const papers = await this.fetchNewPapers();
    
    if (papers.length === 0) {
      return 'No new papers today.';
    }

    // Download PDFs in parallel (rate-limited)
    await this.downloadPDFs(papers);

    // Score papers based on engagement history
    const state = await this.state.get();
    const scored = papers.map(p => ({
      ...p,
      score: state.engagementScores[p.category] || 1.0
    })).sort((a, b) => b.score - a.score);

    // Generate digest
    const digest = `
📚 Daily Digest - ${new Date().toISOString().split('T')[0]}

${scored.slice(0, 5).map((p, i) => `
${i + 1}. **${p.title}**
   Authors: ${p.authors.slice(0, 3).join(', ')}
   Category: ${p.category}
   Score: ${p.score.toFixed(2)}
   
   ${p.abstract.slice(0, 200)}...
`).join('\n')}

Total: ${papers.length} new papers
    `.trim();

    // Update state
    await this.state.update(s => ({
      ...s,
      lastDigestSent: Date.now(),
      papersShown: [
        ...s.papersShown,
        ...papers.map(p => p.id)
      ].slice(-500) // Keep last 500
    }));

    // Log to memory
    await this.memory.log('Digest Sent', 
      `Sent digest with ${papers.length} papers. Top: ${scored[0].title}`
    );

    return digest;
  }

  async handleFeedback(paperId: string, feedback: 'read' | 'skip' | 'save'): Promise<void> {
    // Update engagement scores based on feedback
    const paper = await getPaper(paperId);
    
    const scoreChange = {
      read: 0.2,
      save: 0.3,
      skip: -0.1
    };

    await this.state.update(s => ({
      ...s,
      engagementScores: {
        ...s.engagementScores,
        [paper.category]: (s.engagementScores[paper.category] || 1.0) + scoreChange[feedback]
      }
    }));

    await this.memory.log('Feedback', 
      `User ${feedback} paper: ${paper.title} (category: ${paper.category})`
    );
  }

  async runHeartbeat(): Promise<string> {
    const alerts = await this.heartbeat.run([
      {
        id: 'daily-digest',
        intervalMs: 24 * 60 * 60 * 1000, // Once per day
        check: async () => {
          const state = await this.state.get();
          const hoursSinceLastDigest = (Date.now() - state.lastDigestSent) / 1000 / 60 / 60;
          
          // Send digest if >20 hours since last
          return hoursSinceLastDigest > 20;
        }
      }
    ]);

    if (alerts.length > 0) {
      return await this.generateDigest();
    }

    return 'HEARTBEAT_OK';
  }
}

// Usage
const digest = new ProactiveDigest();

// Run from heartbeat
const response = await digest.runHeartbeat();
console.log(response);

// Handle user feedback
await digest.handleFeedback('2024.12345', 'read');
```

---

## Best Practices

### 1. State File Locations

```
/root/.openclaw/state/        # Persistent state files
/root/.openclaw/workspace/    # User-visible workspace
/tmp/                         # Temporary state (survives restarts but not reboots)
```

### 2. Error Handling

Always handle errors gracefully in checks:

```typescript
{
  id: 'api-check',
  intervalMs: 60000,
  check: async () => {
    try {
      const data = await fetchFromAPI();
      return data.needsAttention;
    } catch (err) {
      console.error('API check failed:', err);
      return false; // Don't alert on errors
    }
  }
}
```

### 3. Rate Limiting

Always rate-limit external API calls:

```typescript
// Bad: No rate limiting
for (const id of paperIds) {
  await downloadPDF(id); // Can trigger rate limit ban
}

// Good: Rate-limited queue
const queue = new TaskQueue({ concurrency: 2, delayMs: 3000 });
const limiter = new RateLimiter({ tokensPerInterval: 20, intervalMs: 60000, minDelayMs: 3000 });

for (const id of paperIds) {
  await queue.add(async () => {
    await limiter.acquire();
    await downloadPDF(id);
  });
}
```

### 4. Memory Hygiene

Keep state files small by using sliding windows:

```typescript
await state.update(s => ({
  ...s,
  items: [...s.items, newItem].slice(-100) // Keep last 100
}));
```

### 5. Idempotency

Design operations to be safely retriable:

```typescript
// Use sets/maps to track processed items
const processed = new Set(state.papersProcessed);

const newPapers = papers.filter(p => !processed.has(p.id));
```

---

## Troubleshooting

### Heartbeat Not Firing

Check intervals and last check times:

```typescript
const remaining = await heartbeat.getNextCheckTime('email', 30 * 60 * 1000);
console.log(`Next check in ${remaining}ms`);
```

### State File Corruption

StateManager writes atomically, but if corruption occurs:

```typescript
await state.clear(); // Reset to defaults
```

### Rate Limiting Issues

Check token availability:

```typescript
console.log('Available tokens:', limiter.getTokens());
```

---

## Further Reading

- [OpenClaw Documentation](https://docs.openclaw.ai)
- [arxiv-coach Source](https://github.com/mindofindica/arxiv-coach)
- [Indica's Workspace](https://github.com/mindofindica/workspace)
