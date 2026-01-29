---
name: tmux
description: Install and use tmux for terminal multiplexing and running TTY-requiring CLIs from automation (e.g. Cursor agent, interactive tools).
---

# Tmux Skill

Tmux provides a persistent pseudo-terminal (PTY). When the user asks to use tmux or run commands in a terminal, use your available tools (their descriptions tell you when to call them). Many CLIs (e.g. Cursor `agent`, interactive REPLs) **require a TTY** and hang or fail when run directly from a script or subprocess. Running them inside tmux fixes this.

## Installation (manual)

Tmux must be installed on the system. Use one of the following.

**macOS (Homebrew):**

```bash
brew install tmux
```

**Ubuntu / Debian:**

```bash
sudo apt update && sudo apt install tmux
```

**Fedora / RHEL:**

```bash
sudo dnf install tmux
```

**Verify:** `tmux -V`

## Basic usage

- **Create detached session:** `tmux new-session -d -s <name>`
- **Send keys:** `tmux send-keys -t <name> "command" Enter`
- **Capture pane output:** `tmux capture-pane -t <name> -p -S -200`
- **Kill session:** `tmux kill-session -t <name>`
- **Check if session exists:** `tmux has-session -t <name> 2>/dev/null`

## Using from automation (viber / scripts)

1. Create or reuse a session: `tmux has-session -t mytask || tmux new-session -d -s mytask`
2. Send `cd` and your command: `tmux send-keys -t mytask "cd /path" Enter` then `tmux send-keys -t mytask "agent -p 'task'" Enter`
3. Wait (e.g. `sleep 30`), then capture: `tmux capture-pane -t mytask -p -S -200`

The **cursor-agent** skill uses this pattern to run the Cursor CLI. Other TTY-requiring tools can use the same approach or the **tmux_run** tool from this skill.

## When to use

- Running Cursor CLI (`agent`) from viber or scripts → use tmux (or the cursor-agent skill).
- Running any interactive CLI from automation → run it inside a tmux session.
- Do **not** run such CLIs with `child_process.exec` or `subprocess.run` without a PTY—they will hang.
