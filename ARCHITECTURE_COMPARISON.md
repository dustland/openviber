# Architecture Comparison: OpenViber vs Nanobot

This document compares the architecture of **OpenViber** with **Nanobot** to highlight the design decisions, trade-offs, and elegance of the OpenViber platform.

## 1. Overview

*   **OpenViber**: An open-source platform that turns your machine into a **Viber** — hosting role-scoped AI workers called **tasks** that automate real work. It features a service-oriented architecture with a daemon, gateway, and web interface.
*   **Nanobot**: An ultra-lightweight (~4k lines) personal AI assistant written in Python. It focuses on simplicity and ease of use for individual users.

## 2. Architectural Approach

### OpenViber: Service-Oriented & Robust
OpenViber adopts a **Service-Oriented Architecture (SOA)** designed for scalability, robustness, and multi-agent collaboration.

*   **Daemon (`src/daemon`)**: A lightweight runtime that manages local execution of skills and LLM interactions. It connects outbound to a gateway, eliminating the need for public IPs.
*   **Gateway (`src/gateway`)**: A central coordination server that manages tasks, dispatches messages, and handles API requests.
*   **Web Interface (`web/`)**: A modern, full-stack SvelteKit application for managing tasks, viewing logs, and configuring the system.
*   **Worker (`src/worker`)**: The core agent logic, encapsulating the `Agent`, `Task`, and `Plan` abstractions.

This separation of concerns allows OpenViber to run in distributed environments, manage multiple agents (vibers) simultaneously, and provide a rich user interface.

### Nanobot: Lightweight & Monolithic
Nanobot follows a **Monolithic Script** approach, optimized for minimal footprint and ease of deployment.

*   **Core (`agent/`)**: A compact Python module handling the agent loop, memory, and tools.
*   **Skills (`skills/`)**: Python-based skills that are directly imported and executed.
*   **Channels (`channels/`)**: Integration modules for chat platforms (Telegram, Slack, etc.).

Nanobot is designed to be a single-process personal assistant, making it easy to run on a laptop or small server but potentially limiting its scalability for complex, multi-agent workflows.

## 3. Key Differences

| Feature | OpenViber | Nanobot |
| :--- | :--- | :--- |
| **Language** | **TypeScript/Node.js** | Python |
| **Type Safety** | **Strict (Static Typing)** | Dynamic |
| **Architecture** | **Service-Oriented (Daemon/Gateway/Web)** | Monolithic (Script/Module) |
| **Scope** | **Platform for AI Workforce** | Personal AI Assistant |
| **Extensibility** | **Declarative (`SKILL.md` + Registry)** | Imperative (Python Code) |
| **Connectivity** | **Persistent WebSocket (Real-time)** | Polling / Webhooks |
| **UI** | **Full-stack Web Dashboard** | CLI / Chat-ops only |

## 4. Why OpenViber is Elegant

OpenViber's architecture demonstrates elegance through **structure, safety, and standardization**.

### 1. Separation of Concerns
By separating the **Runtime (Daemon)** from the **Control Plane (Gateway)** and **User Interface (Web)**, OpenViber ensures that each component has a clear responsibility. The daemon focuses on execution and security, while the web UI provides a rich user experience without bloating the core runtime.

### 2. Type Safety & Maintainability
Written in **TypeScript**, OpenViber leverages static typing to prevent entire classes of runtime errors. This is crucial for a system that interacts with external APIs, manages complex state (Tasks, Plans), and coordinates multiple agents. The rigorous type system makes the codebase self-documenting and easier to refactor.

### 3. Declarative Extensibility
OpenViber uses the **Agent Skills** specification (`SKILL.md`), allowing skills to be defined declaratively with natural language instructions. This makes skills portable and easier to audit compared to arbitrary Python code.

### 4. Standardized AI Abstraction
OpenViber builds upon the **Vercel AI SDK**, a standardized abstraction layer for LLMs. This allows seamless switching between providers (OpenAI, Anthropic, DeepSeek, OpenRouter) and ensures compatibility with the broader AI ecosystem.

## 5. Improvements Inspired by Nanobot

While OpenViber offers a robust platform, Nanobot's simplicity highlights areas for improvement. We are adopting the following features to enhance OpenViber's flexibility:

*   **Custom Provider Support**: Nanobot allows users to configure *any* OpenAI-compatible provider simply by setting a base URL. OpenViber is implementing a generic `custom` provider type to match this flexibility, allowing users to connect to local LLMs (vLLM, Ollama) or other compatible APIs without code changes.
*   **Lightweight Core**: We continue to optimize the `daemon` to ensure it remains lightweight and efficient, taking inspiration from Nanobot's minimal footprint.

## Conclusion

OpenViber and Nanobot serve different purposes. Nanobot is an excellent, lightweight personal assistant. **OpenViber is a comprehensive platform for building and managing an autonomous AI workforce.** Its service-oriented architecture, type safety, and robust design make it the elegant choice for scalable, reliable, and extensible AI agent systems.
