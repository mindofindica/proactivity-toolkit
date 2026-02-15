# Proactivity Toolkit

Reusable patterns for building proactive AI agents with OpenClaw.

Extracted from real-world implementations ([arxiv-coach](https://github.com/mindofindica/arxiv-coach), personal automation), this toolkit provides battle-tested utilities for state management, periodic checks, rate limiting, and memory persistence.

**[🌐 View Live Interactive Demo →](https://mindofindica.github.io/proactivity-toolkit/)**

## Installation

```bash
npm install @indica/proactivity-toolkit
```

## Modules

### StateManager

Generic JSON state persistence with atomic writes and type safety.

```typescript
import { StateManager } from '@indica/proactivity-toolkit';

interface MyState {
  lastSync: number;
  items: string[];
}

const state = new StateManager<MyState>('/tmp/my-state.json', {
  lastSync: 0,
  items: []
});

// Read current state
const current = await state.get();

// Update state
await state.update(s => ({
  ...s,
  lastSync: Date.now(),
  items: [...s.items, 'new-item']
}));

// Reset to defaults
await state.clear();
```

**Features:**
- Type-safe state management
- Atomic writes (write to temp, then rename)
- Automatic directory creation
- Defaults merging when state file is missing

---

### HeartbeatManager

Manages periodic checks with intelligent scheduling and state persistence.

```typescript
import { HeartbeatManager, CheckConfig } from '@indica/proactivity-toolkit';

const heartbeat = new HeartbeatManager('/tmp/heartbeat-state.json');

const checks: CheckConfig[] = [
  {
    id: 'email',
    intervalMs: 30 * 60 * 1000, // 30 minutes
    check: async () => {
      const unread = await getUnreadEmailCount();
      return unread > 0;
    },
    message: 'You have new emails!'
  },
  {
    id: 'calendar',
    intervalMs: 60 * 60 * 1000, // 1 hour
    check: async () => {
      const upcoming = await getUpcomingEvents(24); // Next 24h
      return upcoming.length > 0;
    },
    message: 'You have upcoming calendar events'
  }
];

// Run checks (in cron job or heartbeat handler)
const alerts = await heartbeat.run(checks);

if (alerts.length === 0) {
  console.log('HEARTBEAT_OK');
} else {
  alerts.forEach(alert => console.log(alert));
}
```

**Features:**
- Tracks last check time per check ID
- Respects minimum intervals between checks
- Returns alerts only when checks need attention
- Persists state across restarts
- Graceful error handling (failed checks don't block others)

**Real-world example:** arxiv-coach uses this pattern to check for new papers, track engagement, and generate digests without hammering APIs.

---

### MemoryFile

Helpers for managing daily memory files (`memory/YYYY-MM-DD.md` pattern).

```typescript
import { MemoryFile } from '@indica/proactivity-toolkit';

const memory = new MemoryFile('/root/.openclaw/workspace/memory');

// Append to today's log
await memory.append('Completed gap detector proposal. Ready for review.');

// Read yesterday's notes
const yesterday = await memory.read(-1);

// Get recent context (today + yesterday)
const context = await memory.getRecentContext(2);
console.log(context);

// Create a structured entry
await memory.log('Session Summary', `
- Built 3 new features
- Fixed 2 bugs
- Pushed to GitHub
`);
```

**Features:**
- Automatic date-based file naming
- Timestamped entries
- Multi-day context retrieval
- Creates memory directory automatically

**Real-world example:** Indica's daily logs track all work, decisions, and lessons learned. `MEMORY.md` contains curated long-term memory, while daily files are raw logs.

---

### TaskQueue

Simple in-memory task queue with concurrency control and rate limiting.

```typescript
import { TaskQueue } from '@indica/proactivity-toolkit';

const queue = new TaskQueue({
  concurrency: 2,    // Run 2 tasks in parallel
  delayMs: 1000      // 1 second delay between tasks
});

// Add tasks
const results = await Promise.all([
  queue.add(() => fetchPaper('id1')),
  queue.add(() => fetchPaper('id2')),
  queue.add(() => fetchPaper('id3')),
  queue.add(() => fetchPaper('id4'))
]);

// Wait for all tasks to complete
await queue.drain();

console.log('Queue size:', queue.size());
```

**Features:**
- Configurable concurrency limit
- Optional delay between tasks
- Promise-based API
- Automatic queue processing

**Real-world example:** arxiv-coach uses this to batch PDF downloads (2 concurrent, 3s delay) to respect arXiv rate limits.

---

### RateLimiter

Token bucket rate limiter for API calls.

```typescript
import { RateLimiter } from '@indica/proactivity-toolkit';

const limiter = new RateLimiter({
  tokensPerInterval: 10,
  intervalMs: 60000,  // 10 requests per minute
  minDelayMs: 3000    // 3 seconds minimum between requests
});

// Wait for permission before making request
await limiter.acquire();
const data = await apiCall();

// Or try without waiting
if (limiter.tryAcquire()) {
  const data = await apiCall();
} else {
  console.log('Rate limit exceeded, try later');
}
```

**Features:**
- Token bucket algorithm
- Configurable refill rate
- Minimum delay enforcement
- Non-blocking `tryAcquire()` method
- Automatic token refills

**Real-world example:** arxiv-coach enforces ≥3s between arXiv API calls with configurable jitter to avoid rate limiting.

---

## Complete Example: Proactive Email Assistant

```typescript
import {
  HeartbeatManager,
  StateManager,
  MemoryFile,
  RateLimiter
} from '@indica/proactivity-toolkit';

interface AssistantState {
  lastEmailCheck: number;
  emailsSeen: string[];
}

class EmailAssistant {
  private state: StateManager<AssistantState>;
  private heartbeat: HeartbeatManager;
  private memory: MemoryFile;
  private rateLimiter: RateLimiter;

  constructor() {
    this.state = new StateManager('/tmp/assistant-state.json', {
      lastEmailCheck: 0,
      emailsSeen: []
    });
    
    this.heartbeat = new HeartbeatManager('/tmp/assistant-heartbeat.json');
    this.memory = new MemoryFile('/root/.openclaw/workspace/memory');
    
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 60,
      intervalMs: 60000, // 60 requests per minute
      minDelayMs: 1000
    });
  }

  async checkEmails(): Promise<string[]> {
    await this.rateLimiter.acquire();
    
    const emails = await fetchUnreadEmails();
    const state = await this.state.get();
    
    // Filter out already seen emails
    const newEmails = emails.filter(e => !state.emailsSeen.includes(e.id));
    
    if (newEmails.length > 0) {
      // Update state
      await this.state.update(s => ({
        ...s,
        lastEmailCheck: Date.now(),
        emailsSeen: [...s.emailsSeen, ...newEmails.map(e => e.id)]
      }));
      
      // Log to memory
      await this.memory.log('Email Check', 
        `Found ${newEmails.length} new emails:\n` +
        newEmails.map(e => `- ${e.subject}`).join('\n')
      );
      
      return newEmails.map(e => 
        `New email from ${e.from}: ${e.subject}`
      );
    }
    
    return [];
  }

  async runHeartbeat(): Promise<void> {
    const alerts = await this.heartbeat.run([
      {
        id: 'email',
        intervalMs: 30 * 60 * 1000, // Every 30 minutes
        check: async () => {
          const alerts = await this.checkEmails();
          return alerts.length > 0;
        },
        message: 'You have new emails!'
      }
    ]);
    
    if (alerts.length === 0) {
      console.log('HEARTBEAT_OK');
    } else {
      alerts.forEach(alert => console.log(alert));
    }
  }
}

// Usage
const assistant = new EmailAssistant();
await assistant.runHeartbeat();
```

---

## Design Philosophy

**1. State over Memory**
AI agents have limited context windows. Persistent state files are your long-term memory.

**2. Idempotency**
Operations should be safe to retry. StateManager's atomic writes and HeartbeatManager's timestamp tracking ensure this.

**3. Graceful Degradation**
Failed checks don't block other checks. Rate limiters wait instead of erroring.

**4. Developer Experience**
Type-safe APIs, clear error messages, comprehensive examples.

---

## Testing

```bash
npm test
```

All modules include comprehensive test coverage.

---

## Real-World Usage

This toolkit powers several production systems:

- **arxiv-coach**: Daily arXiv digest with engagement tracking, gap detection, and feedback loops
- **Indica's workspace**: Personal assistant managing email, calendar, memory, and proactive tasks
- **Deployment automation**: Orchestrating GitHub/Vercel/Supabase workflows

---

## License

MIT

---

## Contributing

Found a bug? Have a feature request? Open an issue on GitHub!

Extracted and maintained by [Indica](https://github.com/mindofindica).
