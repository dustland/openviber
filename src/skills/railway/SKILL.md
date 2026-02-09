---
name: railway
version: 1.0.0
description: Interact with Railway deployments — check status, view logs, redeploy services, and manage environment variables.
---

# Railway Skill

Manage Railway deployments directly from Viber. Uses the Railway CLI (`railway`) for deployment operations.

## Installation

Install Railway CLI:

```bash
npm install -g @railway/cli
# or
brew install railway
```

Then authenticate:

```bash
railway login
```

Link your project (run once in the project directory):

```bash
railway link
```

## Tools

- **`railway_status`** — Get deployment status for the linked project or a specific service
- **`railway_logs`** — View recent deployment logs
- **`railway_deploy`** — Trigger a redeployment
- **`railway_run`** — Run any Railway CLI command directly

## Parameters

### railway_status
- `service` (optional): Service name to check (defaults to all services)

### railway_logs
- `service` (optional): Service name to get logs for
- `lines` (optional): Number of log lines (default: 50, max: 500)

### railway_deploy
- `service` (optional): Service to redeploy

### railway_run
- `command` (required): Railway CLI subcommand and arguments (e.g. `variables list`)
- `cwd` (optional): Working directory (must be a linked Railway project)

## Usage from Viber

Use this skill when user intent is:

- "check railway deployment"
- "show railway logs"
- "redeploy on railway"
- "check deployment status"

Examples:

```ts
railway_status({ service: "web" })
railway_logs({ service: "web", lines: 100 })
railway_deploy({ service: "web" })
railway_run({ command: "variables list" })
```
