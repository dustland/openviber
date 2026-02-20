# Architecture Comparison: OpenViber vs Nanobot

This document compares the architecture of OpenViber with [Nanobot](https://github.com/HKUDS/nanobot), highlighting the design choices that make OpenViber a robust, scalable, and elegant platform for autonomous agents.

## Core Philosophy

| Feature | Nanobot | OpenViber |
| :--- | :--- | :--- |
| **Philosophy** | "Ultra-Lightweight", Minimal Footprint (~4k lines) | "Hybrid Autonomous Runtime", Robustness, Scalability |
| **Language** | Python (Dynamic Typing) | TypeScript (Static Typing) |
| **Architecture** | Single-Process Loop | Daemon + Worker + Gateway (Service-Oriented) |
| **Memory** | JSON / Pickle / Simple File | "Text-as-Database" (Markdown: SOUL, USER, MEMORY) |
| **UI** | CLI / Chat Channels Only | SvelteKit Web Dashboard + CLI + Chat Channels |

## Architectural Deep Dive

### 1. Runtime Model: Single Loop vs. Daemon/Worker

**Nanobot** employs a simple, single-threaded (or async) loop. While easy to understand for small scripts, it struggles with isolation and long-running complex tasks that might block the main interface.

**OpenViber** uses a **Daemon + Worker** model:
*   **Daemon:** A lightweight, always-on supervisor that manages state, scheduling, and API access.
*   **Worker:** Heavy lifting (planning, tool execution, LLM inference) happens in isolated contexts (or potentially separate processes/threads).
*   **Gateway:** A dedicated server for external API communication (REST/WebSocket), decoupling IO from intelligence.

**Verdict:** OpenViber's architecture is more **resilient**. A crashing task won't take down the gateway or the daemon.

### 2. Extensibility: Dynamic Registries

Nanobot prides itself on a "Single Source of Truth" `registry.py` for providers.

**OpenViber** adopts a consistent **Registry Pattern** across all extensible components:
*   **Skills:** `src/skills/registry.ts` - Loads capabilities dynamically, supporting progressive disclosure via `SKILL.md`.
*   **Tools:** `src/tools/registry.ts` - Maps executable functions to agent capabilities.
*   **Providers:** `src/viber/registry.ts` - A dynamic, type-safe registry for AI models.

**The Improvement:**
We recently refactored the Provider system to move away from hardcoded switch statements (a common "inelegant" pattern) to a fully dynamic `ProviderRegistry`.
*   **Old:** Hardcoded `switch` in `getModelProvider`.
*   **New:** `defaultProviderRegistry.register("name", factory)`.
*   **Benefit:** Plugins or external modules can register new providers at runtime without modifying core code, matching Nanobot's ease of extension while keeping strict type safety.

### 3. Type Safety & Maintainability

**Nanobot (Python):** Great for rapid prototyping and AI researchers. However, as the codebase grows, dynamic typing can lead to runtime errors that are hard to debug in complex agent interactions.

**OpenViber (TypeScript):**
*   **Interfaces:** `ModelConfig`, `ViberConfig`, `Task` are strictly defined.
*   **Compile-Time Safety:** Catches errors before the agent even starts.
*   **Developer Experience:** Superior autocomplete and refactoring tools.

**Verdict:** OpenViber is more **maintainable** for production-grade systems.

### 4. Memory: Text-as-Database

**Nanobot** typically uses JSON or simple files for memory.

**OpenViber** implements the **"Text-as-Database"** pattern:
*   **SOUL.md:** The agent's core personality and directives.
*   **USER.md:** Knowledge about the user.
*   **MEMORY.md:** Long-term episodic memory.
*   **IDENTITY.md:** System-level identity.

**Benefit:** These files are **native to LLMs**. They are injected directly into the context window, allowing the agent to "read" its memory naturally without complex vector DB retrieval for every small detail (though vector DBs can be added as skills). This is a more "elegant" alignment with how LLMs actually work.

### 5. User Interface

**Nanobot** is headless (CLI/Chat). Visualizing the plan, active tasks, or configuration requires command-line magic.

**OpenViber** includes a polished **SvelteKit Web UI**:
*   **Real-time Monitoring:** See tasks executing step-by-step.
*   **Visual Configuration:** Edit `SOUL.md` or agent configs in the browser.
*   **Chat Interface:** Fallback if you don't use Discord/Telegram.

**Verdict:** OpenViber offers a superior **User Experience**.

## Conclusion

While Nanobot is an excellent example of minimalism, **OpenViber** chooses **Architectural Elegance** through:
1.  **Separation of Concerns** (Daemon/Worker/Gateway).
2.  **Strict Contracts** (TypeScript Interfaces).
3.  **Unified Registry Patterns** (for Skills, Tools, and Providers).
4.  **LLM-Native Design** (Text-as-Database).

The recent refactoring of the Provider system cements this philosophy, ensuring that every part of the system is modular, testable, and extensible.
