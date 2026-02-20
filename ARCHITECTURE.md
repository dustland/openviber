# OpenViber Architecture

OpenViber is designed as a **Hybrid Autonomous Runtime**. It combines the radical simplicity of "Text-as-Database" memory (inspired by lightweight agents like [Nanobot](https://github.com/HKUDS/nanobot)) with the robust, secure, and scalable architecture required for enterprise-grade multi-agent swarms.

## Philosophy: "Structured Creativity"

Many agent frameworks force you into a dichotomy:
*   **Simple:** Easy to start, but hard to scale (e.g., single-file python scripts).
*   **Complex:** Scalable, but over-engineered with vector DBs and heavy infrastructure.

OpenViber bridges this gap. We believe that **memory should be simple (text files)**, but **execution should be robust (TypeScript, Swarms, Gateways)**.

## Core Components

The architecture is divided into four primary layers:

### 1. The Daemon (Orchestrator)
Located in `src/daemon/`, this is the heart of the system.
*   **Runtime:** Manages the lifecycle of agents and tasks.
*   **Personalization:** Implements the "Four-File Pattern" (`SOUL.md`, `USER.md`, `MEMORY.md`, `IDENTITY.md`) to give agents persistent context.
*   **Skills:** Loads capabilities dynamically from `src/skills/`.

### 2. The Gateway (Secure Interface)
Located in `src/gateway/`, this layer provides a secure API for external interaction.
*   **Security:** Implements token-based pairing and webhook verification.
*   **Rate Limiting:** Protects the runtime from abuse.
*   **Idempotency:** Ensures reliable event processing.

### 3. The Swarm (Collaboration)
Located in `src/worker/swarm.ts`, this enables multi-agent collaboration.
*   **Agents:** Config-driven entities that wrap an LLM with specific tools.
*   **Swarm:** Coordinates multiple agents to solve complex tasks.
*   **Space:** A container for task state and shared context.

### 4. Configuration & Environment
Located in `src/config/`, this handles the runtime environment.
*   **Environment Variables:** managed via `src/config/environment.ts`, providing schema validation for runtime secrets.
*   **Personalization:** managed via `src/daemon/personalization.ts`, abstracting the text-file memory logic.

## Comparison: OpenViber vs. Nanobot

We explicitly acknowledge the elegance of [Nanobot](https://github.com/HKUDS/nanobot)'s "Less is More" philosophy and have integrated its best feature—**Text-Based Memory**—into a more powerful runtime.

| Feature | Nanobot (HKUDS) | OpenViber | Why OpenViber? |
| :--- | :--- | :--- | :--- |
| **Memory** | `MEMORY.md` + `grep` | `MEMORY.md` + `grep` (via Node.js) | **Same simplicity**, but integrated into a multi-agent context. |
| **Architecture** | Single-Agent Loop | Multi-Agent Swarm | OpenViber scales from **personal assistant** to **team of workers**. |
| **Language** | Python | TypeScript / Svelte | **Type safety** and **Modern Web UI** (Svelte 5) for better UX. |
| **Security** | Minimal | Gateway + Token Auth | **Enterprise-ready**. Securely expose your agent to the world. |
| **Extensibility**| Python Scripts | Skills (Dynamic Imports) | Skills are modular and can be hot-loaded. |

## The "Elegance" of OpenViber

OpenViber achieves elegance not by being the smallest codebase, but by being the **most organized**.

*   **Clean Separation:** Logic is strictly separated into `daemon`, `gateway`, `worker`, and `config`.
*   **Text-as-Database:** We avoid the complexity of Vector DBs for core memory, preferring human-readable Markdown files that *you* control.
*   **Type Safety:** The entire codebase is strictly typed, preventing an entire class of runtime errors common in dynamic agent scripts.

## Directory Structure

```text
src/
├── cli/              # CLI entrypoints
├── config/           # Environment and configuration schemas
├── daemon/           # Core runtime and personalization logic
│   ├── personalization.ts # The "Soul" of the agent (Text Memory)
│   └── runtime.ts         # Execution loop
├── gateway/          # Secure HTTP/WS API
├── skills/           # Modular capabilities
├── worker/           # Agent and Swarm implementations
└── index.ts          # Library exports
```
