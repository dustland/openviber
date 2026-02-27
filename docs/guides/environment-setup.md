# Environment setup (repo env vars + setup scripts)

OpenViber supports per-repository environment definitions via `.openviber/environment.yaml`.

## 1. Initialize definition

```bash
openviber env init
```

This creates a skeleton at `.openviber/environment.yaml`.

## 2. Store values locally

```bash
openviber env set DATABASE_URL=postgres://...
openviber env set OPENAI_API_KEY=sk-...
```

Values are stored outside the repo under:

- `~/.openviber/environments/<env-id>/values.json`
- `~/.openviber/environments/<env-id>/state.json`

`values.json` is written with `0600` permissions.

## 3. Run setup / maintenance

```bash
openviber env run setup
openviber env run maintenance
```

Before setup/maintenance (and before `npx openviber run` / `npx openviber start` when an environment exists), OpenViber validates required vars and reports missing keys.

## 4. Runtime behavior

- `npx openviber run --env <env-id>` and `npx openviber start --env <env-id>` select an environment id.
- Runtime env vars are injected into terminal/tmux child processes only (not by mutating global `process.env`).
- Variables with `scope: setup_only` are available during setup/maintenance but not injected into terminal runtime.
- Values marked `secret: true` are redacted from terminal stream output.

## Definition format

```yaml
name: my-project
vars:
  DATABASE_URL:
    description: Postgres connection string
    required: true
    secret: true
    scope: runtime
  OPENAI_API_KEY:
    description: API key for setup tools
    required: true
    secret: true
    scope: setup_only
setup:
  - pnpm install
  - pnpm test:run
maintenance:
  - pnpm lint
actions:
  test: pnpm test:run
  dev: pnpm dev
```
