# Viber 2.0 Design Document: The "Vibe-Working" Evolution

## 1. Overview
This document outlines the architectural evolution of **Viber**, inspired by the strengths of `clawdbot` but tailored to our unique positioning as a **"vibe-working" framework**.

Our goal is to create a system that keeps the user in their flow state ("vibing") while powerful, collaborative agents handle tasks in the background or alongside them. We will borrow `clawdbot`'s accessible skill definitions and robust control concepts, but adapt them into a decentralized, multi-agent desktop mesh that connects to various "Command Centers."

## 2. Core Philosophy

*   **Vibe-working vs. Personal Assistant:** Unlike a general-purpose personal assistant (Clawdbot), Viber is a *worker*. It lives on your machine to get things done—coding, debugging, operating browsers, and automating workflows.
*   **Desktop-First Collaboration:** Viber is not just a chatbot; it is a team of agents on your desktop. These agents talk to each other to solve complex problems.
*   **Connect from Anywhere:** You should be able to trigger and control Viber from anywhere (CLI, WhatsApp, Web Dashboard), but the intelligence and execution happen locally on your machine.

## 3. Architecture

### 3.1. Command Center Adapters (The "Anti-Gateway")
Instead of a single monolithic "Gateway" that routes everything, Viber will act as a node that can connect to multiple **Command Centers** simultaneously via **Adapters**.

*   **What is a Command Center?** Any interface that sends instructions and receives updates.
    *   *Examples:* The Viber CLI, a Web Dashboard, a WhatsApp bridge, a Slack bot, or a custom remote control app.
*   **The Adapter Pattern:** Viber will expose a unified API for these adapters to plug in.
    *   Adapters handle the specifics of the transport (WebSocket, HTTP, XMPP, Matrix).
    *   Viber streams *every* conversation and event to connected adapters.

### 3.2. Multi-Agent Desktop Mesh
On the desktop, Viber will run a local mesh of specialized agents.

*   **Collaborative Runtime:** Agents can discover and converse with each other.
    *   *Example:* A "Triage Agent" receives a request, realizes it needs code changes, and delegates to a "Coding Agent" and a "Git Agent."
*   **Conversation-Driven Task Execution:** The primary interface for internal collaboration is conversation. Agents "talk" to coordinate, sharing context and results.

## 4. Skills and Procedures

We will adopt the **`SKILL.md`** standard to democratize capability creation.

### 4.1. `SKILL.md` Adoption
We will support defining tools using a simplified Markdown format, similar to Clawdbot. This allows users to add scripts, shell commands, or API calls as "Skills" without writing complex TypeScript wrappers.

*   **Format:** Standard Markdown header (metadata) followed by an execution procedure (script or steps).
*   **Discovery:** Viber will automatically index `SKILL.md` files in specified directories.

### 4.2. Composite Procedures (Markdown Workflows)
We will introduce a way to define **Composite Procedures** in pure Markdown.

*   **Agentic Workflows:** Instead of rigid JSON pipelines (like Lobster), these will be "playbooks" for agents.
*   **Structure:** A Markdown file that describes a goal and a loose set of steps or rules. The agent reads this and executes the procedure, adapting to errors or unexpected output dynamically ("Agentic Control Flow").

## 5. Connectivity and Control Plane

### 5.1. Full-Duplex Streaming
Transparency is key.
*   **Stream Everything:** Every message, tool call, log line, and thought process of the active agents must be streamed to the connected Command Center(s).
*   **Remote Visibility:** The user should see exactly what Viber is doing, no matter where they are.

### 5.2. Interruption and Real-Time Control
Viber is "open for interruption."
*   **Priority Interrupts:** New messages from a Command Center are treated as high-priority signals.
*   **Pause & Redirect:** Users can intervene in the middle of a procedure (e.g., "Stop, you're editing the wrong file!") and the agents will pause, acknowledge, and adjust.

## 6. Summary of Changes

| Feature | Clawdbot Approach | Viber 2.0 Approach |
| :--- | :--- | :--- |
| **Skill Definition** | `SKILL.md` (Markdown) | **Adopt** `SKILL.md` for ease of use. |
| **Connectivity** | Central Gateway + Channels | **Command Center Adapters** (Pluggable, multi-head). |
| **Workflows** | Lobster (Strict, Typed, JSON) | **Composite Procedures** (Agentic, Markdown-based). |
| **Runtime** | Single Agent / Router | **Multi-Agent Collaboration** (Group chat for tasks). |
| **UX** | Chat Bot / Personal Assistant | **Vibe-Worker** (Flow-centric, desktop automation). |
