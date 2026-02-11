## Task: Implement Config Authority Architecture for Viber Node

Follow the AGENTS.md workspace rules. Use pnpm. Write TypeScript. Add JSDoc for public APIs. Run `pnpm typecheck` after each step to verify.

### Design Principle

The node is the authority on what works. Supabase stores intent. The UI must show the gap between them. Today, config saved to Supabase is treated as "applied" even though the node may never receive or validate it. This refactor fixes that.

### Context: Key Files to Read First

Before starting, read these files to understand the current architecture:
- `AGENTS.md` — workspace rules
- `src/daemon/controller.ts` — WebSocket controller (handles messages from gateway, sends heartbeats)
- `src/daemon/gateway.ts` — Gateway server (REST + WS coordinator)
- `src/daemon/node-status.ts` — Machine/viber status collection
- `src/skills/health.ts` — Skill health check system (SkillHealthCheck, HealthCheckActionType)
- `web/src/routes/api/nodes/[id]/config/+server.ts` — Node config API (GET/PUT)
- `web/src/lib/server/gateway-client.ts` — Web app's gateway client
- `web/src/lib/components/node-detail-panel.svelte` — Node detail UI
- `docs/design/protocol.md` — WebSocket protocol spec

### Critical Findings Driving This Work

1. **`config:update` is dead code** — `controller.ts` lines 477-480 handle it, but nothing ever sends it
2. **No config validation** — LLM keys, OAuth tokens, env secrets are never tested, only checked for existence
3. **Heartbeat loses skill detail** — Node produces rich `SkillHealthCheck[]` with `actionType`, but heartbeat only sends summary `ViberSkillInfo`
4. **`configVersion: Date.now()` is fake** — Generated on every GET, never persisted or tracked
5. **Web UI shows stale state** — Config appears "applied" even when node is offline

### Step 1: Add Config Sync State to Protocol

**Goal:** Extend the heartbeat to include config sync state and add `config:push` / `config:ack` WebSocket messages.

**New types** (add to `src/daemon/node-status.ts` or a shared types file):

```typescript
interface ConfigState {
  configVersion: string;       // hash of current config
  lastConfigPullAt: string;    // ISO timestamp
  validations: ConfigValidation[];
}

interface ConfigValidation {
  category: "llm_keys" | "oauth" | "env_secrets" | "skills" | "binary_deps";
  status: "verified" | "failed" | "unchecked";
  message?: string;
  checkedAt: string;
}
```

**Changes:**
- `src/daemon/node-status.ts`: Add `collectConfigState()` function; include `configState` in `ViberStatus`
- `src/daemon/controller.ts`: Include configState in heartbeat; handle `config:push` message (pull config + validate + send `config:ack`); replace dead `config:update` handler
- `src/daemon/gateway.ts`: Handle `config:ack` message from nodes; add REST endpoint `POST /api/nodes/:id/config-push` that sends WS `config:push` to the target node
- `docs/design/protocol.md`: Document the new `config:push` and `config:ack` messages

### Step 2: Create Config Validator

**Goal:** Create `src/daemon/config-validator.ts` that can actually validate config works (not just exists).

```typescript
// Validate LLM API key with a minimal models-list or single-token completion
async function validateLlmKey(provider: string, apiKey: string): Promise<ConfigValidationResult>

// Validate OAuth token: check expiry, optionally make a test API call
async function validateOAuthToken(provider: string, accessToken: string, expiresAt?: string): Promise<ConfigValidationResult>

// Validate env secrets are present and non-empty
function validateEnvSecrets(expected: string[], actual: Record<string, string>): ConfigValidationResult
```

**Changes:**
- Create `src/daemon/config-validator.ts`
- `src/daemon/controller.ts`: Call validator after config pull; include results in heartbeat configState
- `src/skills/health.ts`: Upgrade `buildEnvCheck()` and gmail health check to use real validation when possible

### Step 3: Push Full Skill Health in Heartbeat

**Goal:** Include full `SkillHealthCheck[]` per skill in heartbeat so gateway/web can show `actionType`, `hint`, `message`.

**Changes:**
- `src/daemon/controller.ts`: In `buildSkillsWithHealth()`, include the full `checks` array (not just summary)
- `src/daemon/gateway.ts`: Store full checks in `ConnectedNode.skills`
- `web/src/lib/components/node-detail-panel.svelte`: Add `actionType` to the `SkillHealthCheck` interface; render action buttons (Connect for oauth, install command for binary, etc.)
- `web/src/routes/api/skills/requirements/+server.ts`: Read from gateway node health data instead of hardcoded fallback

### Step 4: Wire Config Push from Web to Node

**Goal:** When web API saves config to Supabase, also notify the gateway to push to the node.

**Changes:**
- `web/src/routes/api/nodes/[id]/config/+server.ts`: After Supabase write in PUT handler, call `gatewayClient.pushConfigToNode(nodeId)`
- `web/src/lib/server/gateway-client.ts`: Add `pushConfigToNode(nodeId: string)` method (POST to gateway)
- `src/daemon/gateway.ts`: Add `POST /api/nodes/:id/config-push` endpoint that sends WS `config:push` to the target node
- `src/daemon/controller.ts`: On `config:push`, pull latest config via GET, run validator, send `config:ack`

### Step 5: Persist Config Sync State to Supabase

**Goal:** Store the node's config validation results so the web UI can show them even across gateway restarts.

**Changes:**
- Add `config_sync_state jsonb DEFAULT '{}'` column to `viber_nodes` table (Supabase migration)
- `web/src/lib/server/viber-nodes.ts`: Add `updateConfigSyncState(nodeId, syncState)` function
- `src/daemon/gateway.ts`: On `config:ack`, persist validation results via web API callback or direct Supabase write
- `web/src/routes/api/nodes/+server.ts`: Include `config_sync_state` in node listing

### Step 6: Update Web UI

**Goal:** Show config sync state and actionable skill health in the web UI.

**Changes:**
- `web/src/lib/components/node-detail-panel.svelte`:
  - Add config sync badges: "Verified" (green), "Delivered" (yellow), "Pending" (gray), "Failed" (red)
  - Show per-skill action buttons based on `actionType` (Connect for oauth, Copy cmd for binary)
  - Show "Last verified: Xm ago" timestamps
  - Show warning banner when node is offline
- `web/src/routes/(viberboard)/skills/+page.svelte`: Use real node health data from gateway instead of hardcoded requirements
- Node cards: Show sync state indicator badge

### Execution Rules

- Work through steps 1-6 in order (they have dependencies)
- After each step, run `pnpm typecheck` to verify no type errors
- After steps 1-2, run `pnpm test:run` to check for regressions
- Write tests for the config validator (step 2)
- Use existing patterns: follow the style in controller.ts for WS message handling, gateway.ts for REST endpoints
- For the Supabase migration (step 5), create the migration SQL but do NOT run it — just create the file and note it needs to be applied
- Do not modify unrelated code
