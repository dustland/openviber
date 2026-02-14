---
title: "Configuration Schema"
description: "Complete reference for agent, channel, and budget configuration"
---

# Configuration Schema

This document defines the configuration file formats used by OpenViber. Configuration lives under `~/.openviber/` (lightweight, portable). Working data lives in `~/openviber_spaces/` or any directory you point tasks at.

## 1. Directory Layout

```
~/.openviber/                        # Config-only (small, portable)
├── config.yaml                      # Viber-level daemon configuration
├── user.md                          # Shared user context (who you are)
├── skills/                          # Shared skill bundles
│   └── my-skill/
│       └── SKILL.md
├── mcp/                             # MCP server configs (optional)
└── vibers/
    ├── default.yaml                 # Default task config
    ├── default/
    │   ├── soul.md                  # Persona for this task
    │   ├── memory.md                # Long-term memory
    │   ├── memory/                  # Daily memory logs
    │   ├── sessions/                # Conversation logs (*.jsonl)
    │   └── jobs/                    # Scheduled tasks
    ├── dev.yaml                     # Named task config
    └── dev/
        ├── soul.md
        ├── memory.md
        ├── memory/
        ├── sessions/
        └── jobs/

~/openviber_spaces/                  # Working data (large, git-managed)
├── my-webapp/                       # Cloned repo
├── data-pipeline/                   # Another repo
└── market-research/                 # Non-code workspace
```

## 2. Global Configuration (`config.yaml`)

```yaml
# ~/.openviber/config.yaml

# Daemon settings
daemon:
  host: "127.0.0.1"              # Listen address
  port: 3000                     # Listen port
  log_level: "info"              # debug | info | warn | error

# Default model settings (can be overridden per task)
defaults:
  model: "anthropic/claude-sonnet-4-20250514"
  temperature: 0.7
  max_tokens: 4096

# Provider credentials
providers:
  anthropic:
    api_key: "${ANTHROPIC_API_KEY}"  # Environment variable reference
  openai:
    api_key: "${OPENAI_API_KEY}"
    organization: "${OPENAI_ORG_ID}"  # Optional
  ollama:
    base_url: "http://localhost:11434"

# Budget limits (global)
budget:
  enabled: true
  mode: "soft"                   # soft | hard
  daily_limit_usd: 50.00
  monthly_limit_usd: 500.00
  warning_threshold: 0.8         # Warn at 80%

# Channel integrations
channels:
  dingtalk:
    enabled: false
    app_key: "${DINGTALK_APP_KEY}"
    app_secret: "${DINGTALK_APP_SECRET}"
  wecom:
    enabled: false
    corp_id: "${WECOM_CORP_ID}"
    agent_id: "${WECOM_AGENT_ID}"
    secret: "${WECOM_SECRET}"
  wechat:
    enabled: false
    apiKey: "${WECHAT_API_KEY}"
    proxyUrl: "${WECHAT_PROXY_URL}"
    accountId: "${WECHAT_ACCOUNT_ID}"

# Channels gateway settings (webhook server for DingTalk, WeCom, etc.; started with `viber channels`)
gateway:
  host: "0.0.0.0"
  port: 6009
  basePath: ""                 # Optional base path for webhook routes

# Security settings
security:
  require_auth: true             # Require authentication for connections
  auto_approve_localhost: true   # Skip auth for 127.0.0.1
  challenge_ttl_seconds: 300     # Nonce validity period
  session_ttl_seconds: 86400     # 24 hours

# MCP servers
mcp_servers: []                  # See MCP section below
```

### Environment Variable Expansion

Values starting with `${` and ending with `}` are expanded from environment variables:

```yaml
api_key: "${ANTHROPIC_API_KEY}"  # Reads $ANTHROPIC_API_KEY
```

## 3. Task Configuration (`vibers/{id}.yaml`)

```yaml
# ~/.openviber/vibers/default.yaml

# Required fields
name: "Developer"                    # Display name
model: "anthropic/claude-sonnet-4-20250514"    # Provider/model identifier

# Optional fields
description: "Full-stack development task"

# Model parameters
temperature: 0.7
max_tokens: 4096
top_p: 1.0

# Tools available to this task
tools:
  - file                         # read_file, write_file, list_files
  - terminal                     # shell_command
  - browser                      # web_search, web_scrape, browser_action
  - desktop                      # screenshot, click, type

# Tools requiring human approval
require_approval:
  - write_file
  - shell_command
  - browser_action

# Skills to load (from ~/.openviber/skills/)
skills:
  - antigravity
  - cursor-agent
  - codex-cli

# Per-task budget override
budget:
  limit_usd: 10.00
  mode: "hard"

# Working mode default
mode: "viber_decides"            # always_ask | viber_decides | always_execute

# Spaces this task works on
spaces:
  - ~/openviber_spaces/my-webapp
  - ~/code/legacy-api            # Can point anywhere

# Retry configuration
retry:
  max_attempts: 3
  base_delay_ms: 1000
  backoff: "exponential"

# Fallback model (used when primary fails)
fallback_model: "openai/gpt-4o-mini"

# Context management
context:
  max_history_messages: 50       # Truncate older messages
  max_tool_result_length: 10000  # Truncate long tool outputs
  include_system_info: true      # Add OS/env info to context
```

### Model Identifier Format

```
provider/model-name

Examples:
- anthropic/claude-sonnet-4-20250514
- anthropic/claude-3-haiku-20240307
- openai/gpt-4o
- openai/gpt-4o-mini
- ollama/llama2
- ollama/codellama
```

### Tool Reference

| Tool ID | Functions Provided |
|---------|-------------------|
| `file` | `read_file`, `write_file`, `list_files`, `delete_file` |
| `terminal` | `shell_command` |
| `browser` | `web_search`, `web_scrape`, `browser_action` |
| `desktop` | `screenshot`, `mouse_click`, `keyboard_type` |
| `search` | `semantic_search` (workspace search) |

## 4. Channel Configuration

### DingTalk

```yaml
# In config.yaml under channels:
dingtalk:
  enabled: true
  app_key: "${DINGTALK_APP_KEY}"
  app_secret: "${DINGTALK_APP_SECRET}"
  
  # Message formatting
  max_message_length: 2000       # Characters per message
  chunk_on_newline: true         # Prefer splitting on newlines
  
  # Rate limiting
  rate_limit:
    messages_per_minute: 20
    messages_per_hour: 200
  
  # Webhook for outgoing messages (optional)
  webhook_url: "${DINGTALK_WEBHOOK_URL}"
```

### WeCom (企业微信)

```yaml
wecom:
  enabled: true
  corp_id: "${WECOM_CORP_ID}"
  agent_id: "${WECOM_AGENT_ID}"
  secret: "${WECOM_SECRET}"
  
  # Token for callback verification
  callback_token: "${WECOM_CALLBACK_TOKEN}"
  callback_aes_key: "${WECOM_AES_KEY}"
  
  # Message formatting
  max_message_length: 2048
  
  # Rate limiting
  rate_limit:
    messages_per_second: 5
```

### WeChat (微信)

```yaml
wechat:
  enabled: true
  apiKey: "${WECHAT_API_KEY}"
  proxyUrl: "${WECHAT_PROXY_URL}"
  accountId: "default"               # Optional account ID header for proxy

  # Inbound webhook (provided by OpenViber channel gateway)
  # POST /webhook/wechat
```

### Discord

```yaml
discord:
  enabled: true
  botToken: "${DISCORD_BOT_TOKEN}"
  appId: "${DISCORD_APP_ID}"          # Optional
  requireMention: true                # Require @mention in guild channels
  replyMode: "reply"                  # reply | channel
  allowGuildIds: ["123", "456"]       # Optional allowlists
  allowChannelIds: ["123", "456"]
  allowUserIds: ["123", "456"]
```

### Feishu / Lark

```yaml
feishu:
  enabled: true
  appId: "${FEISHU_APP_ID}"
  appSecret: "${FEISHU_APP_SECRET}"
  domain: "feishu"                    # feishu | lark | custom URL
  connectionMode: "websocket"         # websocket | webhook
  webhookPath: "/webhook/feishu"      # Used in webhook mode
  verificationToken: "${FEISHU_VERIFICATION_TOKEN}"
  encryptKey: "${FEISHU_ENCRYPT_KEY}"
  allowGroupMessages: false
  requireMention: true
```

### Web Channel

```yaml
web:
  enabled: true
  cors_origins:
    - "http://localhost:3000"
    - "https://board.example.com"
  
  # Streaming settings
  streaming:
    mode: "auto"                 # auto | token | block
    block_min_chars: 100
    block_max_chars: 500
```

## 5. Budget Configuration

```yaml
budget:
  enabled: true
  
  # Enforcement mode
  mode: "soft"                   # soft: warn only | hard: block at limit
  
  # Limits
  per_task_limit_usd: 5.00       # Per-task maximum
  daily_limit_usd: 50.00         # Daily maximum
  monthly_limit_usd: 500.00      # Monthly maximum
  
  # Thresholds
  warning_threshold: 0.8         # Warn at 80% of limit
  
  # Cost tracking
  track_by: "task"               # task | session | agent | global
  
  # Actions when exceeded
  on_exceed:
    soft: "warn"                 # warn | pause | stop
    hard: "pause"                # pause | stop
```

### Cost Estimation

Costs are estimated using provider pricing:

| Provider | Model | Input (per 1M) | Output (per 1M) |
|----------|-------|----------------|-----------------|
| Anthropic | claude-sonnet-4-20250514 | $3.00 | $15.00 |
| Anthropic | claude-3-haiku | $0.25 | $1.25 |
| OpenAI | gpt-4o | $5.00 | $15.00 |
| OpenAI | gpt-4o-mini | $0.15 | $0.60 |

## 6. Job/Schedule Configuration

Jobs are YAML files stored per-task in `~/.openviber/vibers/{id}/jobs/`:

```yaml
# ~/.openviber/vibers/dev/jobs/morning-standup.yaml

name: "morning-standup"
description: "Daily standup summary"

# Cron schedule (cron syntax)
schedule: "0 9 * * 1-5"          # 9 AM, Monday-Friday

# Task configuration
prompt: |
  Check my GitHub notifications and summarize what needs attention.
  Format as a brief bullet list.

# Override task settings for this job
model: "anthropic/claude-3-haiku-20240307"  # Use cheaper model for routine tasks

# Skills to include
skills:
  - github-notifier

# Approval settings
approval_required: false         # Run unattended

# Notification on completion
notify:
  channel: "dingtalk"
  on: ["completed", "error"]

# Budget for this job
budget:
  limit_usd: 0.50
```

## 7. MCP Server Configuration

```yaml
# In config.yaml under mcp_servers:
mcp_servers:
  - name: "github"
    description: "GitHub API access"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-github"]
    env:
      GITHUB_TOKEN: "${GITHUB_TOKEN}"
    
  - name: "filesystem"
    description: "Extended filesystem operations"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
    
  - name: "postgres"
    description: "Database access"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-postgres"]
    env:
      DATABASE_URL: "${DATABASE_URL}"
    # Require approval for write operations
    require_approval:
      - "query"  # Approve all queries (can be more specific)
```

## 8. Skill Configuration

Skills are loaded from `src/skills/` or `~/.openviber/skills/`:

```
~/.openviber/skills/
└── my-skill/
    ├── SKILL.md                 # Required: frontmatter + instructions
    └── index.ts                 # Optional: tool definitions
```

### SKILL.md Format

```markdown
---
name: my-skill
description: A custom skill for specific tasks
version: 1.0.0
author: Your Name
tags:
  - productivity
  - automation
tools:
  - my_custom_tool
---

# My Skill

Instructions for the agent when this skill is loaded...

## When to Use

- Situation A
- Situation B

## Procedures

1. Step one
2. Step two
```

## 9. Validation

The daemon validates all configuration at startup. Common errors:

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid model format` | Model string doesn't match `provider/model` | Use correct format |
| `Unknown tool: xyz` | Tool not registered | Check available tools |
| `Skill not found: abc` | Skill directory missing | Install or remove from config |
| `Missing required field` | Required field not set | Add the field |
| `Invalid cron expression` | Malformed schedule | Fix cron syntax |

### Validation Command

```bash
openviber config validate
```

## 10. Example Complete Setup

```yaml
# ~/.openviber/config.yaml
daemon:
  port: 3000
  log_level: "info"

defaults:
  model: "anthropic/claude-sonnet-4-20250514"

providers:
  anthropic:
    api_key: "${ANTHROPIC_API_KEY}"
  openai:
    api_key: "${OPENAI_API_KEY}"

budget:
  enabled: true
  mode: "soft"
  daily_limit_usd: 25.00

channels:
  web:
    enabled: true

security:
  require_auth: false
  auto_approve_localhost: true
```

```yaml
# ~/.openviber/vibers/default.yaml
name: "Viber"
model: "anthropic/claude-sonnet-4-20250514"

tools:
  - file
  - terminal
  - browser

require_approval:
  - shell_command

skills:
  - cursor-agent
  - codex-cli

mode: "viber_decides"

spaces:
  - ~/openviber_spaces/my-project
```

---

## Schema Definitions (TypeScript)

For programmatic use, here are the TypeScript types:

```typescript
interface GlobalConfig {
  daemon?: DaemonConfig;
  defaults?: ModelDefaults;
  providers?: Record<string, ProviderConfig>;
  budget?: BudgetConfig;
  channels?: ChannelConfigs;
  security?: SecurityConfig;
  mcp_servers?: McpServerConfig[];
}

interface TaskConfig {
  name: string;
  model: string;
  description?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  tools?: string[];
  require_approval?: string[];
  skills?: string[];
  budget?: TaskBudgetConfig;
  mode?: "always_ask" | "viber_decides" | "always_execute";
  spaces?: string[];
  retry?: RetryConfig;
  fallback_model?: string;
  context?: ContextConfig;
}

interface BudgetConfig {
  enabled: boolean;
  mode: "soft" | "hard";
  per_task_limit_usd?: number;
  daily_limit_usd?: number;
  monthly_limit_usd?: number;
  warning_threshold?: number;
  track_by?: "task" | "session" | "agent" | "global";
  on_exceed?: {
    soft?: "warn" | "pause" | "stop";
    hard?: "pause" | "stop";
  };
}
```
