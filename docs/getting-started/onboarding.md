# Getting Started with OpenViber

OpenViber is an AI agent that runs on your machine. There are two ways to set it up:

## Option A: Connect to OpenViber Web (Recommended)

This connects your local viber to the web dashboard where you can manage config,
send tasks, and monitor your viber remotely.

### Step 1: Create a Viber Node on the Web

1. Log in to [OpenViber Web](http://localhost:6006) (or your deployed URL)
2. Go to **Vibers** → Click **"Add Node"**
3. Give your node a name
4. Copy the generated command

### Optional: Create a viber from an intent

After the node is online, open **Vibers → New Viber** and choose an intent template (for example, _Build a Feature_ or _Code Review_).

The launch flow is:

1. Select an active node
2. Select an intent template (or paste your own goal)
3. OpenViber infers required skills from template metadata, `skills:` blocks, and keywords
4. If the selected node is missing required skills, OpenViber starts guided provisioning before launch
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

**Token expired?** Create a new viber node on the web and run `npx openviber onboard --token` again.

**Can't connect?** Make sure OpenViber Web is running. By default: `http://localhost:6006`

**Intent launch says a skill is missing?** Keep the target node selected and use the guided setup dialog to provision prerequisites, then retry launch.

**Node not selectable in New Viber?** Only active (connected) nodes can receive launches. Start your local daemon with `npx openviber start` and refresh the page.

**Need to switch modes?** You can always re-run `npx openviber onboard --token <token>` to switch
from standalone to connected mode.
