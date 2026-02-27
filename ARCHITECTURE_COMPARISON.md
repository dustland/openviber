# OpenViber vs Nanobot: Architecture & Philosophy

This document compares the architecture and design philosophy of **OpenViber** (TypeScript/Svelte) with **Nanobot** (Python). Both projects aim to create autonomous AI agents, but they take fundamentally different approaches.

## 1. Core Philosophy

| Feature | OpenViber | Nanobot |
| :--- | :--- | :--- |
| **Language** | TypeScript (Static Typing) | Python (Dynamic Typing) |
| **Runtime** | Daemon (Always-on Service) | Script (Ad-hoc Execution) |
| **Architecture** | Service-Oriented (Gateway/Worker/Swarm) | Monolithic / Module-based |
| **UI** | Full Web Dashboard (Svelte 5) | CLI / Chat Channels |
| **Focus** | Enterprise Platform & Local Privacy | Lightweight Research & Prototyping |

**OpenViber** is built as a **platform**. It runs as a local daemon (`viber start`) that manages multiple concurrent "Tasks" (agents), exposes a secure Gateway for external integrations, and provides a rich web interface for monitoring and interaction. It emphasizes **Type Safety**, **Scalability**, and **Separation of Concerns**.

**Nanobot** is built as a **lightweight agent**. It focuses on being minimal (~4k lines of code), easy to read for researchers, and quick to start. It emphasizes **Simplicity** and **Python ecosystem integration**.

## 2. Architectural Elegance

OpenViber demonstrates "Coding Taste" through several key architectural decisions:

### A. Type Safety & Reliability
OpenViber uses **TypeScript** throughout. This provides:
-   **Compile-time safety**: Catching errors before they run (e.g., mismatched tool arguments).
-   **Explicit Contracts**: Interfaces like `Tool`, `Agent`, and `Space` define clear boundaries between components.
-   **Refactoring Confidence**: Large-scale changes are safer because the compiler enforces consistency.

*Contrast*: Python's dynamic typing allows for faster prototyping but can lead to runtime errors in complex, long-running systems.

### B. Separation of Concerns (The "ZeroClaw" Pattern)
OpenViber separates responsibilities clearly:
-   **Gateway (`src/gateway/`)**: Handles HTTP/WebSocket traffic, authentication, and rate limiting. It knows nothing about AI.
-   **Worker (`src/worker/`)**: The "Brain". Handles LLM interaction, context management, and tool execution.
-   **Swarm (`src/worker/swarm.ts`)**: Coordinates multiple agents. It separates *execution* (Agent) from *coordination* (Swarm).
-   **Skills (`src/tools/`)**: Tools are defined with strict schemas (`zod`) and security policies (`ToolTrait`).

*Contrast*: Lightweight scripts often mix networking, logic, and tool execution in a single loop, which becomes hard to maintain as features grow.

### C. Reactive UI (Svelte 5 Runes)
The **Viber Board** (`web/`) is a modern SvelteKit application using **Svelte 5 Runes** (`$state`, `$derived`).
-   **Fine-grained Reactivity**: Only the parts of the UI that change are updated.
-   **State Management**: Complex agent states (streaming tokens, tool outputs) are handled efficiently without heavy virtual DOM diffing.

### D. The "Tool Trait" Standard
OpenViber implements a standardized `Tool` interface (inspired by ZeroClaw/Rust patterns):
-   **Security Policy**: Every tool execution is wrapped with a policy (timeout, allowed commands, file access).
-   **Runtime Isolation**: Tools run through a `RuntimeAdapter`, allowing future support for Docker/Sandboxed execution without changing tool code.

## 3. Future Improvements & Roadmap

To further enhance elegance and maintain "Good Taste", the following improvements are planned:

1.  **Complete Tool Migration**: Migrate all legacy tools to the new `ToolTrait` interface (`src/worker/tool-trait.ts`) to enforce consistent security policies.
2.  **Consolidate Orchestration**: Refactor `ViberAgent` to fully delegate coordination logic to `AgentSwarm`, removing legacy "God Object" patterns.
3.  **Documentation Consistency**: Ensure all documentation reflects the latest CLI commands (`openviber status`, `openviber skill import`) and architectural changes.

## Conclusion

**OpenViber** is designed for the **long haul**. Its architecture prioritizes robustness, security, and scalability, making it suitable for running critical background tasks on your local machine. **Nanobot** is excellent for **quick experiments** and research, but OpenViber's "heavy" architecture is a deliberate choice to enable a reliable, always-on workforce.
