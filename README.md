<img src="https://raw.githubusercontent.com/tiwater/viber/main/docs/src/assets/logo.png" alt="Viber Logo" width="100" />

# @tiwater/viber

**App container for AI coding workflows**

Viber is a runtime that hosts apps to enhance your AI coding experience. Think of it like a container that runs apps - some built-in, others you can discover and install.

## Features

- � **App Container** - Runs and manages app lifecycles
- 🔌 **Extensible** - Install additional apps to extend capabilities  
- 📡 **Command Center** - Connect to remote task servers
- 🛠️ **Built-in Apps** - Comes with useful baseline apps

## Quick Start

```bash
npx @tiwater/viber start
```

## Installation

```bash
npm install -g @tiwater/viber
```

## Usage

```bash
# Run with all built-in apps
viber start

# Connect to a command center
viber start --server wss://your-server.com --token YOUR_TOKEN

# Disable specific apps
viber start --disable-app <app-name>
```

## Built-in Apps

| App | Description |
|-----|-------------|
| `antigravity-healing` | Monitors Antigravity IDE and auto-recovers from errors |

### Antigravity Healing Setup

Start Antigravity with CDP enabled:
```bash
open -a Antigravity --args --remote-debugging-port=9333
```

Then run viber:
```bash
viber start
```

## Developing Apps

Create apps to extend viber's capabilities:

```typescript
// my-app/index.ts
import type { ViberApp } from '@tiwater/viber';

const myApp: ViberApp = {
  name: 'my-app',
  version: '1.0.0',
  
  activate(context) {
    return {
      start: async () => { /* app logic */ },
      stop: async () => { /* cleanup */ }
    };
  }
};

export default myApp;
```

## Documentation

See the [docs](./docs) folder for full documentation.

## License

MIT
