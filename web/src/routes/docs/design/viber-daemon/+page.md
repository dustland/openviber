---
title: "Viber Daemon"
description: Architecture for running Viber as a local daemon connected to a central command center
---
import { Aside } from "$lib/components/docs";

## Overview

A **Viber** is a local agent daemon running on a user's computer, container, or cloud VM. It connects **outbound** to a central command center (Supen) to receive tasks and report status, eliminating the need for public IP addresses or port forwarding.

<Aside type="tip">
  Think of Vibers like satellites that dial home to mission control. They initiate the connection, receive commands, and stream back results.
</Aside>

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SUPEN (Central Command Center)                           │
│                          supen.app / self-hosted                             │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         Gateway / Relay                                 │ │
│  │                                                                         │ │
│  │  • Accept WebSocket connections FROM vibers                            │ │
│  │  • Route commands TO connected vibers                                  │ │
│  │  • Relay events FROM vibers to UI                                      │ │
│  │  • Queue tasks when viber offline                                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                   ▲                                          │
│                 ┌─────────────────┼─────────────────┐                       │
│                 ▼                 ▼                 ▼                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │   Web UI        │  │   Mobile App    │  │   API Clients   │              │
│  │   (Users)       │  │   (optional)    │  │   (integrations)│              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ Outbound WebSocket
                                    │ (viber → server)
┌───────────────────────────────────┼─────────────────────────────────────────┐
│                      VIBER (Local Daemon)                                    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                     ViberController                                      ││
│  │  • Maintain persistent WebSocket to command center                      ││
│  │  • Receive task commands                                                ││
│  │  • Stream events back (progress, results, errors)                       ││
│  │  • Auto-reconnect on disconnection                                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                     ViberAgent (Runtime)                                 ││
│  │  • Execute tasks locally                                                ││
│  │  • Create and manage plans                                              ││
│  │  • Orchestrate tool execution                                           ││
│  │  • Full access to local computer                                        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                     Tool Layer                                           ││
│  │  File | Search | Web | MCP | Desktop (UI-TARS)                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│                         USER'S LOCAL COMPUTER                                │
│                    (No public IP needed)                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### Viber

A **Viber** is a connected agent environment. Each viber has:

| Property | Description |
|----------|-------------|
| `viberId` | Unique identifier (e.g., `viber-macbook-pro-a7x2`) |
| `name` | Human-readable name (e.g., "Hugh's MacBook Pro") |
| `capabilities` | Available tools: `file`, `search`, `web`, `desktop` |
| `status` | `online`, `offline`, `busy` |

### ViberController

The `ViberController` manages the daemon lifecycle:

- **Connection**: Initiates outbound WebSocket to command center
- **Heartbeat**: Sends periodic status updates
- **Reconnection**: Auto-reconnects on network issues
- **Task Management**: Handles task submission, streaming, and completion

### ViberAgent

The `ViberAgent` (formerly XAgent) is the orchestrating agent that:

- Creates and adapts plans for complex goals
- Delegates to specialized agents when needed
- Executes tools within the local environment
- Manages artifacts and task history

## Communication Protocol

### Connection Flow

1. **Authenticate**: Viber obtains token via `viber login`
2. **Connect**: Viber initiates WebSocket to `wss://supen.app/vibers/ws`
3. **Register**: Viber sends capabilities and info
4. **Listen**: Viber waits for commands
5. **Execute**: Viber runs tasks and streams results

### Message Types

#### Server → Viber

```typescript
type ServerMessage =
  | { type: "task:submit"; taskId: string; goal: string; options?: TaskOptions }
  | { type: "task:stop"; taskId: string }
  | { type: "task:message"; taskId: string; message: string }
  | { type: "ping" }
  | { type: "config:update"; config: Partial<AgentConfig> };
```

#### Viber → Server

```typescript
type ViberMessage =
  | { type: "connected"; viber: ViberInfo }
  | { type: "task:started"; taskId: string; spaceId: string }
  | { type: "task:progress"; taskId: string; event: StreamEvent }
  | { type: "task:completed"; taskId: string; result: TaskResult }
  | { type: "task:error"; taskId: string; error: string }
  | { type: "heartbeat"; status: ViberStatus }
  | { type: "pong" };
```

## CLI Commands

```bash
# Start the viber daemon
viber start

# Start with custom name
viber start --name "My MacBook Pro"

# Start with desktop control enabled
viber start --desktop

# Authenticate and register viber
viber login

# Check status
viber status

# Run a task locally (without Supen)
viber run "Research AI frameworks"
```

## Deployment Models

### Local Desktop

Run directly on macOS, Windows, or Linux:

```bash
# Install globally
npm install -g @viber/cli

# Start daemon
viber start --desktop
```

**Capabilities**: Full desktop control, file access, browser automation

### Docker Container

Run in an isolated container:

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y chromium xvfb
WORKDIR /app
RUN npm install -g @viber/cli
ENV VIBER_TOKEN=${VIBER_TOKEN}
CMD ["viber", "start"]
```

**Capabilities**: File access, headless browser, isolated environment

### Cloud VM

Run on AWS, GCP, or other cloud providers:

```bash
# On the VM
viber start --server wss://your-supen.com/vibers/ws
```

**Capabilities**: Scalable, ephemeral, can include VNC for desktop

## Security

<Aside type="caution">
  Vibers have full access to the local system. Only run trusted vibers and keep tokens secure.
</Aside>

### Authentication

- **Token-based**: JWT or API key obtained via `viber login`
- **Per-viber tokens**: Each viber has its own token
- **Revocable**: Tokens can be revoked from Supen

### Transport

- **TLS**: All WebSocket connections use `wss://`
- **Encrypted**: Task data encrypted in transit

### Permissions

- **Sandboxed by default**: Tools have minimal permissions
- **Escalation**: Desktop tools require explicit `--desktop` flag

## Example Usage

```typescript
import { ViberController } from '@viber/core';

const controller = new ViberController({
  serverUrl: 'wss://supen.app/vibers/ws',
  token: process.env.VIBER_TOKEN,
  viberId: 'viber-macbook-pro-a7x2',
  viberName: "Hugh's MacBook Pro",
});

controller.on('connected', () => {
  console.log('Viber connected to command center');
});

controller.on('task', async (task) => {
  console.log(`Received task: ${task.goal}`);
});

await controller.start();
```
