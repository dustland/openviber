# Architecture Comparison: OpenViber vs Nanobot

This document outlines the architectural differences between OpenViber and Nanobot, demonstrating why OpenViber's approach offers superior elegance, scalability, and developer experience while retaining the simplicity of lightweight agents.

## 1. Core Philosophy & Structure

### OpenViber: Service-Oriented Architecture
OpenViber follows a modern, service-oriented design:
- **Daemon (`src/daemon`)**: A persistent background service that manages agents ("Vibers"), memory, and scheduling. It runs independently of the user interface.
- **Gateway (`src/gateway`)**: A standard HTTP/WebSocket API that allows any client (CLI, Web, Mobile) to interact with the daemon.
- **Web Interface (`web/`)**: A full-featured SvelteKit application for monitoring, configuration, and interaction.
- **Monorepo**: Keeps backend and frontend in sync while enforcing clear separation of concerns.

**Why it's elegant:** This separation allows OpenViber to run on a server (headless) while being controlled from a laptop or phone. It scales from a single local agent to a distributed system of specialized workers.

### Nanobot: Monolithic Script
Nanobot is designed as a "lightweight" Python script (~4000 lines).
- **Single Process**: The agent loop, tools, and interface are tightly coupled in a single runtime.
- **CLI/Chat-Centric**: Primarily designed to be run in a terminal or via chat platforms (Telegram/Slack).

**Critique:** While simple to start, this monolithic approach makes it difficult to build complex workflows, integrate with external systems programmatically, or scale beyond a single machine without significant re-engineering.

## 2. Extensibility & Coding Tastes

### Provider Management
- **Nanobot**: Claims "2 simple steps" (likely import/export) but relies on modifying core files or simple configuration.
- **OpenViber**: Uses a **Dynamic Provider Registry** (Dependency Injection pattern).
    - Providers are registered at runtime via `ProviderRegistry.register()`.
    - New providers (e.g., local LLMs, custom proxies) can be added via plugins without touching the core codebase.
    - Default providers (OpenAI, Anthropic, DeepSeek) are pre-configured but replaceable.

### Type Safety & Robustness
- **Nanobot (Python)**: Dynamic typing allows for rapid prototyping but can lead to runtime errors in complex agent logic.
- **OpenViber (TypeScript)**: Strictly typed interfaces for `Agent`, `Task`, `Tool`, and `Provider` ensure compile-time safety. This is crucial for autonomous agents where runtime failures can be costly or dangerous.

## 3. Memory Systems

Both projects recognize the elegance of plain-text memory over complex vector databases.

- **Nanobot**: Uses `MEMORY.md` and `HISTORY.md` with `grep` for retrieval.
- **OpenViber**: Also utilizes `MEMORY.md` for long-term facts, managed by the `Daemon`.
    - **Advantage**: OpenViber's `consolidateMemory` runs as a background process within the Daemon, ensuring memory is updated asynchronously without blocking the user's interaction flow. It uses an LLM to intelligently summarize and structure the memory, rather than just appending logs.

## 4. Tooling & Ecosystem

- **Nanobot**: Uses basic shell commands (`tmux`) and custom tool implementations.
- **OpenViber**: Built on the **Model Context Protocol (MCP)** standards.
    - Tools are standardized, meaning OpenViber can leverage the growing ecosystem of MCP servers and tools.
    - Sandboxed execution via `SecurityGuard` ensures safe file system and command access.

## Conclusion

While Nanobot excels at being a minimal, "hackable" script for individual use, **OpenViber** provides a more robust, scalable, and professional architecture. It successfully marries the simplicity of text-based memory with the power of a service-oriented, strictly-typed system, making it the more elegant choice for building reliable and extensible AI agents.
