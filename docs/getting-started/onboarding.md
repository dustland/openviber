# Getting Started with OpenViber

OpenViber is an AI agent that runs on your machine. There are two ways to set it up:

- **Standalone mode**: local CLI/daemon only, no web control plane required.
- **Connected mode**: your local **Viber** is registered to a **Gateway** and controlled from the **Viber Board** (web UI).

Use this guide if you want explicit onboarding steps for both modes and a clear picture of how Viber ↔ Gateway ↔ Viber Board are wired together.

## Option A: Connect to OpenViber Web (Recommended)

This connects your local viber to the web dashboard where you can manage config,
send tasks, and monitor your viber remotely.

### Step 1: Create a Viber on the Web

1. Log in to [OpenViber Web](http://localhost:6006) (or your deployed URL)
2. Go to **Vibers** → Click **"Add Viber"**
3. Give your viber a name
4. Copy the generated command

### Optional: Create a task from an intent

After the viber is online, open **Tasks → New Task** and choose an intent template (for example, _Build a Feature_ or _Code Review_).

The task launch flow is:

1. Select an active viber
2. Select an intent template (or paste your own goal)
3. OpenViber infers required skills from template metadata, `skills:` blocks, and keywords
4. If the selected viber is missing required skills, OpenViber starts guided provisioning before launch
5. After prerequisites are ready, the task launches automatically with the selected intent body

Supported proactive skill provisioning currently covers:

- `cursor-agent`
- `codex-cli`
- `gemini-cli`
- `github`
- `gmail`
- `railway`
- `tmux` (terminal backing skill)

You can manage templates in **Settings → Intents**.

### Step 2: Run the Onboard Command

Paste the command in your terminal:

```bash
npx openviber onboard --token <token>
```

This will:

- Install/update OpenViber
- Create `~/.openviber/` configuration directory
- Connect your machine to the web dashboard
- Save connection config for future use

> **Note:** The token expires in **15 minutes**. If it expires, generate a new one on the web.

### Step 3: Set Your API Key

```bash
export OPENROUTER_API_KEY="sk-or-v1-xxx"
```

Get an API key at: [openrouter.ai/keys](https://openrouter.ai/keys)

### Step 4: Start Your Viber

```bash
npx openviber start
```

That's it! Your viber will automatically connect to OpenViber Web.
**No extra flags needed** — it reads your saved config.

---

## Option B: Standalone Setup (Local Only)

If you just want to run a viber locally without the web dashboard:

```bash
npx openviber onboard
```

Then:

```bash
export OPENROUTER_API_KEY="sk-or-v1-xxx"
npx openviber start
```

You can connect to OpenViber Web later:

```bash
npx openviber onboard --token <token-from-web>
```

---

## Wiring Overview: Standalone vs Gateway + Board

### Standalone (Viber only)

```text
You (terminal)
   │
   ▼
OpenViber CLI/Daemon on your machine
   │
   └── Uses local ~/.openviber state + your model API key
```

In this mode, there is no remote registration handshake.

### Connected (Viber + Gateway + Board)

```text
Viber Board (Web UI :6006)
   │   HTTPS / WS
   ▼
Viber Gateway (:6007)
   │   WS
   ▼
Your local OpenViber Daemon (Viber)
```

Connected mode uses an onboarding token to bind your local viber to the gateway project/workspace so the board can dispatch tasks and observe status.

### Component Responsibilities

| Component | Role during onboarding | Role after onboarding |
| --- | --- | --- |
| Viber (local daemon) | Creates local runtime state and (in connected mode) exchanges token for persistent connection config. | Executes tasks, streams status/events, manages local memories/skills/tools. |
| Gateway (`:6007`) | Validates onboarding token and associates viber identity to backend records. | Routes commands/events between viber and board. |
| Viber Board (`:6006`) | Creates viber records and issues short-lived onboard tokens. | Operator UI for launching, monitoring, and configuring vibers. |

---

## Onboarding Checklist by Mode

### Standalone checklist

1. Run `npx openviber onboard`.
2. Set `OPENROUTER_API_KEY` (or your configured provider key).
3. Start with `npx openviber start`.
4. Validate locally with `npx openviber status` or `npx openviber chat`.

### Connected checklist (Gateway + Board)

1. Open Viber Board and create a viber to obtain a token.
2. On the target machine, run `npx openviber onboard --token <token>` within 15 minutes.
3. Start the daemon (`npx openviber start`).
4. Verify the viber appears active/selectable in **Vibers** and **New Task** flows.
5. Launch a test task from the board and confirm round-trip events.

---

## Current Gaps to Watch While Wiring

When integrating viber + gateway + board, these are common missing pieces to identify early:

- **Connection diagnostics are still mostly manual**: users often fall back to `status`, logs, and page refreshes to understand handshake failures.
- **Token lifecycle UX can be improved**: expired/invalid token feedback is functional but could be more guided across CLI and board.
- **Post-onboarding verification is implicit**: there is no single built-in `onboarding doctor` flow that checks key, connectivity, and viber readiness end-to-end.
- **Mode visibility could be clearer**: users may not immediately know whether they are running purely standalone or currently linked to a gateway workspace.

If you are setting up team onboarding, treat the checklist above as a baseline and document your environment-specific validation steps (auth provider, deployment URL, proxy, and firewall rules).

---

## File Structure

After onboarding, your `~/.openviber/` directory looks like:

```
~/.openviber/
├── config.yaml          # Connection config (auto-generated)
├── viber-id             # Unique machine identifier
├── user.md              # Your context (shared across vibers)
├── vibers/
│   ├── default.yaml     # Default viber configuration
│   └── default/
│       ├── soul.md      # Viber personality
│       └── memory.md    # Long-term notes
└── skills/              # Custom skills
```

---

## Commands Reference

| Command                             | Description              |
| ----------------------------------- | ------------------------ |
| `npx openviber onboard`             | Set up standalone mode   |
| `npx openviber onboard --token <t>` | Connect to OpenViber Web |
| `npx openviber start`               | Start the viber daemon   |
| `npx openviber run "<task>"`        | Run a one-off task       |
| `npx openviber chat`                | Interactive chat mode    |
| `npx openviber status`              | Check viber status       |

---

## Troubleshooting

**Token expired?** Create a new viber on the web and run `npx openviber onboard --token` again.

**Can't connect?** Make sure OpenViber Web is running. By default: `http://localhost:6006`

**Intent launch says a skill is missing?** Keep the target viber selected and use the guided setup dialog to provision prerequisites, then retry launch.

**Viber not selectable in New Task?** Only active (connected) vibers can receive launches. Start your local daemon with `npx openviber start` and refresh the page.

**Need to switch modes?** You can always re-run `npx openviber onboard --token <token>` to switch
from standalone to connected mode.
