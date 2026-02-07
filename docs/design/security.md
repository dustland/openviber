---
title: "Security & Multi-Tenancy in Viber"
description: "Security architecture for OpenViber viber execution"
---

# Security & Multi-Tenancy in Viber

The Viber framework is architected with a security-first mindset, designed to support both single-user experimentation and secure, multi-tenant production deployments. The core principle is **Isolation by Default**: every Space operates within a completely separate, sandboxed environment.

This document outlines the layered security model that makes this possible.

```mermaid
graph TD
    subgraph "User"
        direction LR
        User["Authenticated User"]
    end

    subgraph "Security Layers"
        direction TB
        L1["Layer 1: API & Access Control"]
        L2["Layer 2: Space Isolation"]
        L3["Layer 3: Secure Tool Execution"]
        L4["Layer 4: Auditability & Observability"]
    end

    subgraph "Space Resources"
        direction LR
        Space["Space"]
        Tools["Tools"]
        Events["Event Log"]
    end

    User -- "Requests Access" --> L1
    L1 -- "Enforces Permissions For" --> L2
    L2 -- "Contains" --> Space
    L2 -- "Protects" --> L3
    L3 -- "Manages" --> Tools
    L4 -- "Records Everything From" --> L1
    L4 -- "Records Everything From" --> L2
    L4 -- "Records Everything From" --> L3
    L4 -- "Generates" --> Events

    style User fill:#D6EAF8
    style L1 fill:#E8F8F5
    style L2 fill:#EBF5FB
    style L3 fill:#FDF2E9
    style L4 fill:#FEF9E7
```

## The Four Layers of Security

Viber's security model is composed of four distinct layers that work together to protect the system and its users.

### 1. Layer 1: API & Access Control

All interactions with the Viber framework are mediated by a secure API layer.

- **Authentication**: The API layer is responsible for verifying the identity of the user. In a production environment, this is typically handled via JWTs, API keys, or other standard authentication mechanisms. The core framework remains agnostic to the specific method used.
- **Authorization**: Once a user is authenticated, the API layer ensures they are only able to access the Spaces and resources they are authorized to use. A request from `user_A` to access a Space owned by `user_B` will be rejected at this outermost layer.
- **User-Scoped Operations**: Every API endpoint is implicitly scoped to the authenticated user. A call to list Spaces will only ever return the Spaces owned by the currently logged-in user.

### 2. Layer 2: Space Isolation

This is the most fundamental security boundary in Viber. Every Space is encapsulated within its own isolated environment, completely separate from all other Spaces.

- **Artifact Isolation**: Each Space has its own dedicated artifact storage. Vibers operating within one Space have no ability to read, write, or even be aware of the existence of files in another Space. Path traversal attacks are mitigated by resolving all file paths relative to the Space's root.
- **Memory Isolation**: The AI's long-term, semantic memory is also strictly partitioned by Space. A viber's query will only ever search for information within the context of the current Space.
- **State Isolation**: All Space state, including the plan, conversation history, and execution status, is stored within the Space's isolated environment.

This strict separation ensures that even if a viber behaves unexpectedly, the potential impact is confined to its own sandboxed environment.

### 3. Layer 3: Secure Tool Execution

Vibers in Viber do not have direct access to system resources. All interactions with the outside world are mediated by the Tool Manager, which acts as a security-aware sandbox.

- **Declarative Permissions**: The specific tools that a viber is allowed to use are explicitly defined in the viber's configuration. A viber cannot invoke a tool that it has not been granted permission to use.

```typescript
const viber = new Agent({
  name: "Developer",
  tools: ["read_file", "write_file", "execute_code"],
  requireApproval: ["write_file", "execute_code"], // Human approval required
});
```

- **Parameter Validation**: Before executing any tool, the Tool Manager validates the arguments provided by the viber against the tool's defined schema. This prevents malformed calls and a class of potential injection attacks.
- **Human-in-the-Loop**: Sensitive tools can require human approval before execution, providing an additional layer of control.

#### Tool sandboxing (containerized execution)

Optional **container sandboxing** for tool execution is a critical defense-in-depth feature:

- **Sandbox on/off**: tools run in a container when enabled; otherwise they run on the host.
- **Modes**:
  - `off`: no sandboxing.
  - `non-main`: sandbox only non-main sessions (e.g., background/autoreply).
  - `all`: every session uses a sandbox.
- **Scope**:
  - `session`: one container per session.
  - `viber`: one container per viber.
  - `shared`: one container shared by all sandboxed sessions.
- **Workspace access**:
  - `none`: sandbox has its own workspace.
  - `ro`: mounts workspace read-only.
  - `rw`: mounts workspace read/write.
- **Elevated tools**: explicitly host-executed tools (e.g., `tools.elevated`) bypass sandboxing and require stricter approvals.

This preserves the open-environment requirement while reducing blast radius for tool execution.

### 4. Layer 4: Auditability & Observability

A secure system must be auditable. The Activity Timeline provides a complete log of every significant action taken within Viber.

- **Comprehensive Event Trail**: Every API request, every viber action, every tool call, and every artifact modification is captured as a structured event.
- **Real-Time Monitoring**: This event stream can be monitored in real-time to detect anomalous behavior or potential security threats.
- **Forensic Analysis**: In the event of a security incident, the detailed event log provides a powerful tool for forensic analysis, allowing administrators to trace the exact sequence of actions that occurred.

## Multi-Tenancy in Practice

These four layers work in concert to enable secure multi-tenancy. When a user creates a Space, it is tied to their identity at the API layer. From that point on, all other security mechanisms—from Space isolation to tool permissions—are enforced within the context of that Space.

```typescript
// Each user only sees their own Spaces
const spaces = await spaceManager.listSpaces({ userId: currentUser.id });

// Space operations are scoped
const space = await spaceManager.getSpace(spaceId);
if (space.userId !== currentUser.id) {
  throw new UnauthorizedError("Access denied");
}
```

## Tool Approval Flow

For sensitive operations, Viber supports human-in-the-loop approval:

```typescript
// Frontend: Handle approval status
const { messages, status, approveToolCall } = useXChat({
  spaceId,
});

if (status === "awaiting-approval") {
  const message = messages[messages.length - 1];
  const pendingTools = getPendingApprovals(message);

  return (
    <ApprovalDialog
      tools={pendingTools}
      onApprove={(toolCallId) => approveToolCall(toolCallId, true)}
      onReject={(toolCallId) => approveToolCall(toolCallId, false)}
    />
  );
}
```

## Storage Security

### Local Storage (`@viber/local`)

- SQLite database with per-user isolation
- Filesystem storage with directory-based separation
- No network exposure by default

### Cloud Storage (`@viber/supabase`)

- Row-Level Security (RLS) policies enforce user isolation
- Supabase Storage with bucket-level permissions
- Encrypted connections (TLS)
- Service role keys isolated from client

```sql
-- Example RLS policy
CREATE POLICY "Users can only access their own spaces"
ON spaces
FOR ALL
USING (user_id = auth.uid());
```

## Node Onboarding Security

Node registration follows a **Cloudflare Zero Trust** pattern: the Board generates a one-time token, the user runs a single command on the target machine, and the node connects outbound.

```bash
npx openviber connect --token eyJub2RlIjoiYTFiMmMz...
```

### Security Properties

| Property | How |
|----------|-----|
| **One-time token** | Expires after first use or after TTL (default: 15 minutes) |
| **No inbound ports** | Node connects outbound to the Board via WebSocket |
| **Device binding** | After initial connect, device ID is pinned — reconnections use the bound identity |
| **Revocable** | Board can revoke node access at any time from the dashboard |
| **Token contents** | Signed JWT containing: node ID, Board URL, expiry, org scope |

### What the Token Does NOT Contain

- No API keys or provider credentials (those are configured locally in `~/.openviber/config.yaml`)
- No user data or viber configurations
- No long-lived secrets — the token bootstraps a device binding, then is discarded

### Post-Onboarding

After the initial token handshake, the node uses a **device certificate** for reconnections. This certificate is stored in `~/.openviber/` and is tied to the machine's hardware identity. If the node moves to a different machine, the user must re-pair from the Board.

---

This layered approach ensures that Viber can be deployed with confidence in shared environments, providing the robust isolation required for production applications while maintaining the flexibility and power of the underlying framework.
