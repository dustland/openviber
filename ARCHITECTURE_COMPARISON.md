# Architecture Comparison: OpenViber vs Nanobot

This document provides a detailed architectural comparison between **OpenViber** and **Nanobot** to highlight the design decisions that make OpenViber a more elegant, scalable, and modern solution for autonomous agents.

## 1. Project Structure & Scalability

### OpenViber
- **Monorepo Architecture (pnpm workspaces)**: Clearly separates the core agent logic (`src`), the web interface (`web`), and documentation (`docs`). This allows for independent development, testing, and deployment of components.
- **Service-Oriented**: The `daemon` runs as a background service managed by a `ViberController`, handling persistent connections, heartbeats, and task orchestration independently of the CLI or frontend.
- **Modular Components**:
  - `src/viber/`: Core agent abstractions (Agent, Task, Plan).
  - `src/skills/`: Registry of skills, decoupled from the agent core.
  - `src/daemon/`: System-level services (scheduler, telemetry, memory).
  - `src/gateway/`: API gateway for external access.

### Nanobot
- **Single Python Package**: A traditional flat structure (`nanobot/agent`, `nanobot/skills`). While simple, it tightly couples the CLI, agent loop, and tools, making it harder to extend or integrate into larger systems.
- **Script-Based**: Primarily runs as a CLI script or loop. Lacks a dedicated daemon architecture for long-running background management (though it has a basic loop).

**Verdict**: OpenViber's monorepo and service-oriented architecture provide superior scalability and maintainability for production-grade deployments.

## 2. Technology Stack & Type Safety

### OpenViber
- **TypeScript/Node.js**: leveraging strict static typing (`AgentConfig`, `ViberMessage`, `TaskRuntimeState`). This eliminates entire classes of runtime errors common in dynamic languages.
- **Modern Async/Await**: Node.js event loop is ideal for I/O-heavy agent operations (network calls, file I/O).
- **Vercel AI SDK**: Uses the industry-standard `ai` SDK for uniform LLM interactions, streaming, and tool calling.

### Nanobot
- **Python**: Dynamic typing can lead to runtime errors if not meticulously managed.
- **Manual JSON Handling**: Often relies on manual `json.dumps`/`json.loads` for tool arguments, which is error-prone compared to TypeScript's type-safe interfaces or Zod schemas.

**Verdict**: OpenViber's strict TypeScript codebase ensures higher reliability and developer productivity through better tooling and compile-time checks.

## 3. Cognitive Architecture & Memory

### OpenViber (Enhanced)
- **Config-Driven Agents**: Agents are defined purely by configuration (YAML/JSON), separating behavior from implementation. This allows for dynamic agent creation and "swapping" of brains without code changes.
- **Self-Improving Memory**: Features a sophisticated `MemoryManager` (in `src/daemon/memory.ts`) that automatically consolidates conversation history into long-term memory (`MEMORY.md`) using an LLM-driven process. This runs asynchronously after tasks, ensuring the agent learns over time without blocking execution.
- **Personalization**: Injects `SOUL.md`, `USER.md`, and `IDENTITY.md` context layers dynamically.

### Nanobot
- **Code-Driven Agents**: Agent logic is often hardcoded in `loop.py`.
- **Hardcoded Memory Prompt**: Uses a hardcoded prompt inside the python code for memory consolidation, which is less flexible.

**Verdict**: OpenViber's config-driven design and modular memory system represent a more flexible and "AI-native" approach.

## 4. Skills & Tooling

### OpenViber
- **Progressive Discovery**: Skills define `SKILL.md` instructions that are injected into the system prompt, allowing the agent to "learn" how to use tools dynamically.
- **Decoupled Registry**: Tools are registered in a central `SkillRegistry`, allowing for easy addition of third-party skills (MCP, local binaries).
- **Security**: Explicit permission models (e.g., `require_approval` in config) and safe execution wrappers.

### Nanobot
- **Python Modules**: Skills are just Python classes. While functional, they lack the semantic "instruction" layer that helps LLMs understand *when* to use a tool, not just *how*.

**Verdict**: OpenViber's semantic skill definition (`SKILL.md`) is a significant advancement in agent steerability.

## 5. User Interface

### OpenViber
- **Dedicated Web UI**: Includes a SvelteKit-based dashboard (`Viberboard`) for real-time monitoring, task management, and configuration.
- **Terminal Streaming**: Supports streaming tmux sessions to the web UI via WebSocket, bridging the gap between CLI and GUI.

### Nanobot
- **CLI Only**: Primary interaction is via terminal. Lacks a rich visual interface for monitoring complex agent states or history.

**Verdict**: OpenViber offers a complete product experience with its integrated web dashboard, whereas Nanobot is primarily a developer tool.

## 6. Extensibility & Integrations

### OpenViber
- **Channel Abstraction**: Features a strict `Channel` interface that decouples the agent core from communication protocols.
- **Unified Gateway**: The `ChannelGateway` manages multiple channels (Discord, Feishu, Telegram, Web) simultaneously, handling routing and streaming with a unified event model.
- **Example**: Telegram support was added cleanly by implementing a single class (`TelegramChannel`) and registering it, without touching the core agent logic.

### Nanobot
- **Direct Integration**: Channels often require more direct integration into the main loop or configuration parsing logic.
- **Provider Registry**: While modular, it relies on python-specific class introspection which can be fragile.

**Verdict**: OpenViber's interface-based design allows for safer and more predictable extensions.

## Conclusion

OpenViber demonstrates a significantly more elegant and mature architecture. It treats the agent not just as a script, but as a **platform**—with distinct layers for core logic, communication, memory, and user interaction. The ecosystem of channels (including the newly added Telegram support), skills, and memory consolidation proves its capability to handle advanced cognitive tasks in a modular, robust way.
