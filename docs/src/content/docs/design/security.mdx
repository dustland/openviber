---
title: "Security & Multi-Tenancy in Viber"
description: "Understanding the layered security model in Viber, from Space isolation to secure tool execution and multi-tenancy."
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

- **Artifact Isolation**: Each Space has its own dedicated artifact storage. Agents operating within one Space have no ability to read, write, or even be aware of the existence of files in another Space. Path traversal attacks are mitigated by resolving all file paths relative to the Space's root.
- **Memory Isolation**: The AI's long-term, semantic memory is also strictly partitioned by Space. An agent's query will only ever search for information within the context of the current Space.
- **State Isolation**: All Space state, including the plan, conversation history, and execution status, is stored within the Space's isolated environment.

This strict separation ensures that even if an agent behaves unexpectedly, the potential impact is confined to its own sandboxed environment.

### 3. Layer 3: Secure Tool Execution

Agents in Viber do not have direct access to system resources. All interactions with the outside world are mediated by the Tool Manager, which acts as a security-aware sandbox.

- **Declarative Permissions**: The specific tools that an agent is allowed to use are explicitly defined in the agent's configuration. An agent cannot invoke a tool that it has not been granted permission to use.

```typescript
const agent = new Agent({
  name: "Developer",
  tools: ["read_file", "write_file", "execute_code"],
  requireApproval: ["write_file", "execute_code"], // Human approval required
});
```

- **Parameter Validation**: Before executing any tool, the Tool Manager validates the arguments provided by the agent against the tool's defined schema. This prevents malformed calls and a class of potential injection attacks.
- **Human-in-the-Loop**: Sensitive tools can require human approval before execution, providing an additional layer of control.

### 4. Layer 4: Auditability & Observability

A secure system must be auditable. The Activity Timeline provides a complete log of every significant action taken within Viber.

- **Comprehensive Event Trail**: Every API request, every agent decision, every tool call, and every artifact modification is captured as a structured event.
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

This layered approach ensures that Viber can be deployed with confidence in shared environments, providing the robust isolation required for production applications while maintaining the flexibility and power of the underlying framework.
