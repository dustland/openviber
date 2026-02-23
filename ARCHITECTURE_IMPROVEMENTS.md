# Architecture Improvements - Summary

This document summarizes the architectural improvements made to OpenViber inspired by ZeroClaw's design.

## Phase 1: Gateway Layer with Security

### New File: `src/gateway/http-gateway.ts`

A new general-purpose HTTP gateway with security features, separate from the existing viber daemon coordination gateway.

**Features:**
- **Rate Limiting**: Sliding window rate limiter for preventing abuse
- **Pairing Authentication**: One-time pairing code system that exchanges for bearer tokens
- **Idempotency**: Prevents duplicate webhook processing
- **Webhook Secret Validation**: Constant-time comparison for secure webhook verification
- **Security First**: Blocks public bind by default, requires explicit opt-in

**API Endpoints:**
- `GET /health` - Health check
- `POST /pair` - Exchange pairing code for bearer token
- `POST /webhook` - Webhook endpoint with auth and idempotency

**Usage:**
```typescript
import { createHttpGatewayServer } from './gateway/http-gateway';

const gateway = createHttpGatewayServer({
  port: 3000,
  requirePairing: true,
  webhookSecret: process.env.WEBHOOK_SECRET,
}, {
  onWebhook: async (req) => {
    // Handle webhook
    return { status: 200, json: { received: true } };
  },
});

await gateway.start();
```

**Classes:**
- `HttpGatewayServer` - Main server class
- `SlidingWindowRateLimiter` - Rate limiting implementation
- `IdempotencyStore` - Idempotency key tracking
- `PairingGuard` - Authentication and pairing logic

## Phase 2: Simplified Agent Architecture

### New File: `src/worker/swarm.ts`

Separated multi-agent coordination from individual agent execution.

**Key Changes:**
1. **Agent** remains the single agent type - handles LLM interaction
2. **AgentSwarm** - NEW: coordinates multiple agents
3. **ParallelExecutionEngine** - executes agents concurrently

**Before:**
```
ViberAgent → delegates to Agent
ViberAgent → manages Space
ViberAgent → handles Plan/Collaboration
```

**After:**
```
Agent → handles single LLM execution
AgentSwarm → routes and coordinates multiple Agents
Space → container for agents and tasks
```

**Usage:**
```typescript
import { AgentSwarm } from './worker/swarm';

const swarm = new AgentSwarm(space);

// Route to specific agent
const result = await swarm.route("coder", "Write a function");

// Execute multiple agents in parallel
const results = await swarm.executeParallel(
  ["coder", "reviewer", "tester"],
  "Analyze this code"
);
```

**Classes:**
- `AgentSwarm` - High-level coordination
- `ParallelExecutionEngine` - Parallel execution
- `SwarmTask` / `SwarmResult` - Task/result types

## Phase 3: Standardized Tool Interface

### New File: `src/worker/tool-trait.ts`

A unified Tool trait that all tools implement, inspired by ZeroClaw's design.

**Key Concepts:**
1. **Tool interface** - All tools implement this
2. **SecurityPolicy** - Passed to every tool execution
3. **RuntimeAdapter** - Abstraction for execution environment
4. **ToolContext** - Contains security, runtime, and metadata

**The Tool Interface:**
```typescript
interface Tool {
  getSpec(): ToolSpec;
  execute(params: unknown, context: ToolContext): Promise<ToolResult>;
}
```

**Security Policy:**
```typescript
interface SecurityPolicy {
  timeoutMs: number;
  restrictToWorkspace: boolean;
  blockedCommands: RegExp[];
  allowedCommands: RegExp[];
  maxOutputSize: number;
  requiresApproval: boolean;
}
```

**Tool Result:**
```typescript
interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
  data?: unknown;
}
```

**New Shell Tool Example:**
See `src/tools/shell-v2.ts` for the new implementation.

**Migration Path:**
1. Existing tools can extend `BaseTool` for convenience
2. Implement `spec()` and `executeImpl()` methods
3. Security context is passed automatically
4. Runtime adapter handles execution

## Design Principles Applied

From ZeroClaw:
- **Separation of Concerns**: Gateway, Agent, Swarm are distinct
- **Security First**: Default secure, explicit opt-in for dangerous operations
- **Trait-based Design**: Tools implement a common interface
- **Runtime Isolation**: RuntimeAdapter abstraction for future docker support

Preserved from OpenViber:
- **Config-driven agents**: No agent subclasses needed
- **Skill system**: SKILL.md for instructions, tools for execution
- **Multi-tenancy**: Space-based isolation

## Next Steps (Optional)

If you want to continue improving:
1. **Phase 4**: Add vector search to memory (pgvector)
2. **Phase 5**: Consolidate config into single schema
3. **Migrate**: Update all existing tools to use new Tool interface
4. **Runtime**: Implement DockerRuntimeAdapter

---

## Phase 6: Usability & Simplicity (Nanobot-Inspired)

To match the "elegance of simplicity" found in Nanobot, we are implementing improvements to the CLI and onboarding experience.

### 1. Interactive Standalone Mode
**Goal:** Enable users to chat with an agent immediately without starting a daemon or web UI.
**Action:** Update `viber run` to support an interactive REPL mode when no goal argument is provided. This mimics `nanobot agent` behavior.

### 2. Unified Configuration
**Goal:** Simplify the "Getting Started" experience by offering a single-file configuration option for simple use cases.
**Action:** Draft a schema that consolidates `viber.yaml`, `providers`, and `skills` configuration into a single file, reducing the cognitive load of the multi-file structure.

### 3. Documentation "Time-to-Hello-World"
**Goal:** Reduce the time from `npm install` to first successful interaction.
**Action:** Update documentation to prioritize the standalone `viber run` command as the entry point for new users.
