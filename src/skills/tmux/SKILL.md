---
name: tmux
version: 1.1.0
description: Terminal multiplexing — create, manage, and monitor persistent terminal sessions for TTY-requiring CLIs and multi-terminal layouts.
requires:
  binaries:
    - name: tmux
      hint: "Install with: brew install tmux (macOS) or sudo apt install tmux (Ubuntu/Debian)"
---

# Tmux Skill

Tmux provides persistent pseudo-terminal (PTY) sessions. Many CLIs (e.g. Cursor `agent`, interactive REPLs) **require a TTY** and hang or fail when run directly from a script or subprocess. Running them inside tmux fixes this.

## Tools

### Discovery & health

- **tmux_install_check** — Check if tmux is installed; call before any other tmux tool.

### Session management

- **tmux_new_session** — Create a detached session (e.g. `coding`). Optionally name the first window and set start directory.
- **tmux_kill_session** — Kill (destroy) a session and all its windows/panes. Use to clean up after tasks complete.
- **tmux_rename_session** — Rename an existing session to a more meaningful name.

### Window management

- **tmux_new_window** — Create a new window in a session. Use to add Cursor Agent, Claude Code, Codex CLI, or dev server terminals. Optionally run a command in the new window.
- **tmux_kill_window** — Kill (close) a specific window in a session.
- **tmux_rename_window** — Rename a window (e.g. `cursor-3`, `dev-server`).

### Pane management

- **tmux_split_pane** — Split a pane (horizontal or vertical). Use to add a dev server pane next to a coding window. Optionally run a command in the new pane.

### Input / output

- **tmux_send_keys** — Send keys or a command to a target: `session`, `session:window`, or `session:window.pane`.
- **tmux_capture_pane** — Read the current visible content of a pane without sending any command. Use to monitor long-running processes, check build output, or read interactive CLI state.

### Listing & discovery

- **tmux_list** — List sessions, or list windows/panes for a session. Use when the user asks "what is my tmux layout" or "list my terminals."

### Run & capture

- **tmux_run** — Run one command in a session and return captured output (for TTY-requiring CLIs). Creates the session if it doesn't exist. For reading existing output without sending a command, use `tmux_capture_pane` instead.

## Target format

- **Session:** `coding`
- **Window:** `coding:1` (index) or `coding:cursor-1` (name)
- **Pane:** `coding:1.0` (window 1, pane 0)

## Multi-terminal layout (e.g. AI coding)

When the user wants **multiple terminals** (e.g. 3× Cursor Agent, 3× Claude Code, 2× Codex CLI, 2× dev servers):

1. **tmux_install_check** — ensure tmux is installed.
2. **tmux_new_session** — create session (e.g. `coding`) with optional first window name.
3. **tmux_new_window** — for each terminal: create a window (optionally named, e.g. `cursor-1`, `codex-a`) and optionally run a command.
4. **tmux_split_pane** — when the user wants a pane split (e.g. dev server next to a Cursor window).
5. **tmux_list** — to describe the layout or choose where to open the next window.
6. **tmux_capture_pane** — to check what's happening in any pane.
7. **tmux_kill_window** / **tmux_kill_session** — to clean up when done.

Convention: one session per "workspace" (e.g. `coding`), window names like `cursor-1`, `cursor-2`, `codex-a`, `codex-b`, `dev-1`. User attaches with `tmux attach -t coding`.

## Monitoring running processes

Use **tmux_capture_pane** to peek at what's happening in a terminal without interrupting the process:

```
tmux_capture_pane({ target: "coding:dev-1", lines: 100 })
```

This is particularly useful for:
- Checking if a dev server has finished starting
- Reading build/test output from a running process
- Monitoring Cursor Agent or Codex CLI progress

## Session lifecycle

1. **Create** → `tmux_new_session` with a descriptive name
2. **Populate** → `tmux_new_window` / `tmux_split_pane` for each terminal
3. **Operate** → `tmux_send_keys` to run commands, `tmux_capture_pane` to monitor
4. **Reorganize** → `tmux_rename_session` / `tmux_rename_window` as needed
5. **Clean up** → `tmux_kill_window` for individual windows, `tmux_kill_session` when done

## When to use

- Running Cursor CLI (`agent`) from viber or scripts → use tmux (or the cursor-agent skill).
- **Setting up many terminals** (Cursor Agent, Claude Code, Codex CLI, dev servers) → use the session/window/pane tools.
- **Monitoring long-running processes** → use `tmux_capture_pane`.
- Running any interactive CLI from automation → run it inside a tmux session.
- Do **not** run such CLIs with `child_process.exec` or `subprocess.run` without a PTY—they will hang.
