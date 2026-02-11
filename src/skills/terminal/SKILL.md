---
name: terminal
version: 2.0.0
description: Create, manage, and monitor persistent terminal sessions for running commands, dev servers, and interactive CLIs.
requires:
  binaries:
    - name: tmux
      hint: "Install with: brew install tmux (macOS) or sudo apt install tmux (Ubuntu/Debian)"
---

# Terminal Skill

Manage persistent terminal sessions that survive disconnections and can be viewed from the web UI. Sessions run in the background and their output can be read at any time.

## Tools

### Health check

- **terminal_check** — Verify the terminal backend is available. Call before using other terminal tools.

### Session management

- **terminal_new_session** — Create a persistent terminal session (e.g. `coding`, `dev`).
- **terminal_kill_session** — Destroy a session and all its windows/panes.
- **terminal_rename_session** — Rename a session.

### Window management

- **terminal_new_window** — Add a new window (tab) to a session. Optionally run a command.
- **terminal_kill_window** — Close a specific window.
- **terminal_rename_window** — Rename a window (e.g. `server`, `tests`).

### Pane management

- **terminal_split_pane** — Split a window into side-by-side or stacked panes.

### Input / output

- **terminal_send_keys** — Type into a terminal (send keys or a command).
- **terminal_read** — Read the current visible content of a terminal without interrupting it.

### Listing

- **terminal_list** — List all sessions, or list windows/panes within a session.

### Run & capture

- **terminal_run** — Run a command in a session and return the output. Creates the session if needed.

## Target format

Targets identify which terminal to interact with:

- **Session:** `coding`
- **Window:** `coding:1` (by index) or `coding:server` (by name)
- **Pane:** `coding:1.0` (window 1, pane 0)

## Setting up a multi-terminal workspace

When the user needs multiple terminals (e.g. editors, dev servers, test runners):

1. **terminal_check** — ensure the backend is available.
2. **terminal_new_session** — create a session (e.g. `dev`).
3. **terminal_new_window** — add windows for each purpose (`server`, `tests`, `editor`).
4. **terminal_split_pane** — split windows when side-by-side views are needed.
5. **terminal_send_keys** — run commands in specific terminals.
6. **terminal_read** — check output without interrupting.
7. **terminal_kill_window** / **terminal_kill_session** — clean up when done.

## Monitoring running processes

Use **terminal_read** to peek at what's happening without interrupting the process:

```
terminal_read({ target: "dev:server", lines: 100 })
```

This is useful for:
- Checking if a dev server has finished starting
- Reading build/test output
- Monitoring AI agent progress

## Session lifecycle

1. **Create** → `terminal_new_session` with a descriptive name
2. **Populate** → `terminal_new_window` / `terminal_split_pane` for each terminal
3. **Operate** → `terminal_send_keys` to run commands, `terminal_read` to monitor
4. **Reorganize** → `terminal_rename_session` / `terminal_rename_window` as needed
5. **Clean up** → `terminal_kill_window` for individual windows, `terminal_kill_session` when done

## When to use

- Running interactive CLIs (Cursor agent, REPLs) that require a real terminal
- Setting up multi-terminal workspaces with dev servers, test runners, editors
- Monitoring long-running processes (builds, deployments, AI agents)
- Any command that needs to persist after the viber conversation ends
