# Architecture Comparison: OpenViber vs Nanobot

This document compares the architecture of **OpenViber** with **Nanobot** (https://github.com/HKUDS/nanobot), highlighting the design choices, strengths, and trade-offs of each system.

## Overview

| Feature | OpenViber | Nanobot |
| :--- | :--- | :--- |
| **Language** | TypeScript (Node.js) + Svelte 5 | Python 3.11+ |
| **Core Concept** | Task Workforce (Daemon + Workers) | Personal Assistant (Single Loop) |
| **Structure** | Monorepo (Daemon, Gateway, Web UI) | Flat Package (Agent, Skills, Tools) |
| **Configuration** | Distributed (YAML/Markdown per task) | Centralized (Single `config.json`) |
| **Extensibility** | "Skills" (Markdown-defined) | Python Tools / MCP |
| **Runtime** | Hybrid (Daemon + Worker + Gateway) | Lightweight Loop (`agent/loop.py`) |

## Architectural Deep Dive

### OpenViber: The Enterprise "Task Workforce"
OpenViber treats AI agents as a "workforce" of specialized tasks. Its architecture is designed for scale, strict separation of concerns, and robust multi-tenancy.

*   **Daemon/Worker Model:** The runtime separates the *Daemon* (orchestration, scheduling) from the *Worker* (execution). This allows tasks to run in isolation, potentially on different threads or even machines (in future iterations).
*   **Space & Plan Abstraction:** OpenViber introduces high-level abstractions like `Space` (a workspace for collaboration) and `Plan` (a structured sequence of `Task`s). This allows for complex, multi-step goals that persist over time.
*   **Strict Typing (Zod):** The codebase leverages TypeScript and Zod schemas to strictly validate LLM outputs (e.g., plans, tool calls), reducing runtime errors and "hallucinated" parameters.
*   **No-Code Skills:** Skills are defined primarily in Markdown (`SKILL.md`), making it easy for non-developers to teach agents new capabilities via prompt engineering, while implementation details (`tool.ts`) are kept separate.

### Nanobot: The Lightweight "Personal Assistant"
Nanobot is optimized for simplicity, speed, and ease of modification ("hackability").

*   **Single Loop:** The core logic resides in `AgentLoop` (Python), which iterates through a conversation. It is stateless (besides the message history) and easy to understand in a single read.
*   **Pythonic Simplicity:** Leveraging Python's dynamic nature, tools are simple classes. Configuration is a single JSON file, making onboarding extremely fast (`pip install` -> `config.json` -> run).
*   **Direct MCP Integration:** Nanobot has native, lightweight support for the Model Context Protocol (MCP), allowing it to connect to external tools easily.
*   **Research-Ready:** The codebase is small (~4k lines), making it an excellent base for academic research or quick prototyping.

## Elegance Comparison

### Where OpenViber Wins
OpenViber's "elegance" comes from its **robustness and structure**:
1.  **Type Safety:** The use of TypeScript and Zod provides a safety net that Python lacks without strict MyPy enforcement. This is crucial for building reliable autonomous agents that handle file systems and APIs.
2.  **Separation of Concerns:** The clear distinction between *Defining* a task (YAML/Markdown) and *Executing* it (Runtime) allows for a cleaner mental model when managing multiple agents.
3.  **UI/UX:** Including a dedicated Svelte 5 Web UI (`viber-board`) provides a superior user experience for monitoring and managing tasks compared to a pure CLI.

### Where Nanobot Wins
Nanobot's "elegance" comes from its **minimalism**:
1.  **Zero Friction:** You can read the entire source code in an afternoon. There is no complex build step (just `pip install`).
2.  **Unified Config:** A single `config.json` is easier for a single user to manage than OpenViber's multi-file structure.
3.  **Interactive by Default:** The default mode is a chat loop, which is what most users expect from an "agent".

## Conclusion

OpenViber is the "more elegant" solution for **building a production-grade, scalable, and reliable agent workforce**. Its architecture enforces best practices (typing, modularity) that pay off as complexity grows.

However, we can learn from Nanobot's **onboarding experience**. To make OpenViber's power more accessible, we should adopt:
1.  **Interactive Standalone Mode:** A `viber run` that works instantly like Nanobot's CLI.
2.  **Simplified Config:** Options to consolidate configuration for simple use cases.
