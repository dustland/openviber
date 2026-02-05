---
title: "Memory Architecture"
description: "Long-term memory, semantic indexing, and context injection strategies"
---

# Memory Architecture

Memory in OpenViber refers to persistent knowledge that outlives a single conversation. This document defines the memory model, storage format, and injection strategies.

## 1. Design Principles

1. **Workspace-first**: Memory lives in `~/.openviber/workspace/` as human-readable files
2. **Board-controlled injection**: The Viber Board decides what memory to include in each request
3. **No implicit retrieval**: The daemon does not autonomously search memory — it receives memory as context
4. **Optional indexing**: Semantic search is opt-in; flat files work without it

## 2. Memory Tiers

```
┌─────────────────────────────────────────────────────────────┐
│                     Memory Hierarchy                         │
├─────────────────────────────────────────────────────────────┤
│  Tier 1: Conversation Context (ephemeral)                   │
│  • Current session messages                                  │
│  • Managed by Viber Board, sent per-request                 │
├─────────────────────────────────────────────────────────────┤
│  Tier 2: Working Memory (task-scoped)                       │
│  • task.md — current plan and progress                       │
│  • Active for duration of task                               │
├─────────────────────────────────────────────────────────────┤
│  Tier 3: Long-term Memory (persistent)                      │
│  • MEMORY.md — curated notes and preferences                │
│  • memory/YYYY-MM-DD.md — daily logs                        │
│  • Persists across tasks and sessions                        │
├─────────────────────────────────────────────────────────────┤
│  Tier 4: Semantic Index (optional)                          │
│  • memory/{agent-id}.sqlite — vector embeddings             │
│  • Enables similarity search over Tier 3                     │
└─────────────────────────────────────────────────────────────┘
```

## 3. File Formats

### MEMORY.md (Curated Long-term Notes)

```markdown
# Memory

## User Preferences
- Prefers concise responses
- Uses TypeScript for all projects
- Dark mode preferred in generated UIs

## Project Context
- Main project: OpenViber framework
- Repository: github.com/dustland/openviber
- Package manager: pnpm (never npm or yarn)

## Important Decisions
- 2024-01-10: Chose stateless daemon architecture
- 2024-01-15: Adopted workspace-first storage model

## Learned Patterns
- User often asks for code reviews before commits
- Prefers function components over class components in React
```

### Daily Logs (memory/YYYY-MM-DD.md)

```markdown
# 2024-01-15

## Session Summary
- Worked on authentication flow
- Fixed bug in WebSocket reconnection
- User approved new error handling approach

## Key Decisions
- Use JWT for session tokens (not cookies)
- Set default timeout to 30 seconds

## Notes for Future
- User mentioned wanting to add rate limiting next week
- Remember to check test coverage before PR
```

### task.md (Working Memory)

```markdown
# Current Task

## Goal
Build a landing page with contact form

## Plan
- [x] Set up Next.js project
- [x] Create hero section
- [ ] Add contact form (in progress)
- [ ] Deploy to Vercel

## Context
- Using Tailwind CSS for styling
- Form should validate email before submit
- User wants dark theme only

## Blockers
None currently
```

## 4. Memory Injection

### When to Inject Memory

| Scenario | What to Inject |
|----------|----------------|
| New conversation | MEMORY.md (full or excerpt) |
| Continuing task | task.md + relevant MEMORY.md sections |
| Reference question | Relevant daily logs via search |
| Complex task | MEMORY.md + recent daily logs |

### Injection Format

Memory is injected as a system message or user message prefix:

```typescript
// Option 1: System message section
const systemPrompt = `
You are Viber, a helpful assistant.

<memory>
${memoryContent}
</memory>

<task>
${taskContent}
</task>
`;

// Option 2: Separate user message
const messages = [
  { role: "system", content: baseSystemPrompt },
  { role: "user", content: `Context from memory:\n${memoryContent}` },
  { role: "user", content: actualUserMessage },
];
```

### Size Management

Memory injection should respect context limits:

```typescript
interface MemoryInjectionConfig {
  max_memory_tokens: number;      // Default: 2000
  max_task_tokens: number;        // Default: 1000
  max_daily_logs: number;         // Default: 3 (most recent)
  truncation_strategy: "head" | "tail" | "smart";
}
```

## 5. Memory Updates

### Automatic Updates (by Viber Board)

The Viber Board can automatically update memory based on conversation:

```typescript
// After task completion
async function updateMemory(result: TaskResult) {
  // 1. Append to daily log
  await appendToDailyLog({
    date: new Date(),
    summary: result.summary,
    decisions: extractDecisions(result.text),
  });

  // 2. Optionally update MEMORY.md if significant
  if (isSignificantLearning(result)) {
    await appendToMemory({
      section: "Learned Patterns",
      content: extractLearning(result),
    });
  }
}
```

### Manual Curation

Users can edit memory files directly. The daemon reads them as static context:

```bash
# Edit long-term memory
vim ~/.openviber/workspace/MEMORY.md

# View recent daily logs
ls ~/.openviber/workspace/memory/
cat ~/.openviber/workspace/memory/2024-01-15.md
```

### Agent-Suggested Updates

The agent can suggest memory updates in its response:

```markdown
I've completed the task. 

<memory_suggestion>
Add to MEMORY.md under "Project Context":
- Email validation uses zod schema with custom regex
</memory_suggestion>
```

The Viber Board parses this and prompts the user to accept/reject.

## 6. Semantic Index (Optional)

For large memory stores, an optional SQLite-based semantic index enables similarity search.

### Schema

```sql
-- ~/.openviber/memory/{agent-id}.sqlite

CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  source_file TEXT NOT NULL,      -- e.g., "MEMORY.md" or "2024-01-15.md"
  content TEXT NOT NULL,          -- Original text chunk
  embedding BLOB NOT NULL,        -- Vector embedding (float32 array)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  metadata JSON                   -- Optional: section headers, tags
);

CREATE INDEX idx_source ON chunks(source_file);

-- Virtual table for vector search (using sqlite-vss or similar)
CREATE VIRTUAL TABLE chunks_vss USING vss0(embedding(1536));
```

### Indexing Process

```typescript
async function indexMemoryFile(filePath: string) {
  const content = await readFile(filePath);
  const chunks = splitIntoChunks(content, {
    maxChunkSize: 500,
    overlap: 50,
    splitOn: ["##", "\n\n", ". "],
  });

  for (const chunk of chunks) {
    const embedding = await getEmbedding(chunk.text);
    await db.run(`
      INSERT INTO chunks (source_file, content, embedding)
      VALUES (?, ?, ?)
    `, [filePath, chunk.text, embedding]);
  }
}
```

### Search Query

```typescript
async function searchMemory(query: string, limit: number = 5) {
  const queryEmbedding = await getEmbedding(query);
  
  const results = await db.all(`
    SELECT c.content, c.source_file, c.metadata
    FROM chunks c
    JOIN chunks_vss v ON c.id = v.rowid
    WHERE vss_search(v.embedding, ?)
    LIMIT ?
  `, [queryEmbedding, limit]);

  return results;
}
```

### When to Use Semantic Search

| Memory Size | Recommendation |
|-------------|----------------|
| < 10 files, < 50KB | Direct file read, no index needed |
| 10-100 files | Index recommended for daily logs |
| > 100 files | Index required for practical retrieval |

## 7. Memory Flush (Pre-Compaction)

Before compacting conversation history, a "memory flush" extracts durable notes:

```typescript
async function memoryFlush(conversation: Message[]) {
  // 1. Identify key information to preserve
  const extraction = await agent.generateText({
    messages: [
      {
        role: "system",
        content: `Extract key decisions, preferences, and facts from this conversation 
                  that should be remembered for future sessions. Format as bullet points.`,
      },
      ...conversation,
    ],
  });

  // 2. Append to daily log
  await appendToDailyLog({
    date: new Date(),
    content: extraction.text,
    source: "memory_flush",
  });

  // 3. Optionally update MEMORY.md
  if (containsLongTermLearnings(extraction)) {
    await promptUserToUpdateMemory(extraction);
  }
}
```

## 8. Privacy & Retention

### Data Retention

```yaml
# In config.yaml
memory:
  retention:
    daily_logs_days: 90          # Delete logs older than 90 days
    index_rebuild_days: 7        # Rebuild index weekly
  
  # What to exclude from indexing
  exclude_patterns:
    - "*.secret.md"
    - "credentials/*"
```

### Memory Isolation

In multi-agent setups, each agent has isolated memory:

```
~/.openviber/
├── workspace/                   # Shared workspace
│   ├── MEMORY.md               # Shared memory
│   └── memory/                 # Shared daily logs
└── memory/
    ├── agent-a.sqlite          # Agent A's semantic index
    └── agent-b.sqlite          # Agent B's semantic index
```

## 9. Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| MEMORY.md file format | ✅ Defined | Human-editable markdown |
| Daily log format | ✅ Defined | Auto-created per day |
| task.md format | ✅ Defined | Board-managed |
| Memory injection | 🔶 Partial | Viber Board responsibility |
| Semantic index | ⏳ Planned | Optional enhancement |
| Auto-extraction | ⏳ Planned | Memory flush on compaction |

---

## Summary

Memory in OpenViber is **file-first and Board-controlled**:

1. **Files are the source of truth** — MEMORY.md and daily logs under `~/.openviber/workspace/`
2. **Viber Board injects memory** — Daemon receives memory as context, doesn't retrieve autonomously
3. **Semantic search is optional** — SQLite index for large memory stores
4. **Human-readable and editable** — Users can directly edit memory files

This design keeps the daemon stateless while enabling rich, persistent context across sessions.
