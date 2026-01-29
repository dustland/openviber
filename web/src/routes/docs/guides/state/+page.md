---
title: "State Management"
description: Reactive state with Zustand in Viber
---
import { Aside } from "$lib/components/docs";

## Overview

Viber uses Zustand for state management, providing a simple yet powerful reactive state system that works across React and Svelte.

## Core Stores

Viber provides several pre-built stores:

```typescript
import { useAgentStore, useSpaceStore, useChatStore } from 'viber';
```

## Agent Store

```typescript
import { useAgentStore } from 'viber';

const store = useAgentStore();

// Access state
console.log(store.getState().agents);

// Subscribe to changes
store.subscribe((state) => {
  console.log('Agents updated:', state.agents);
});
```

## Framework Integration

### React

```tsx
import { useAgentStore } from 'viber/react';

function AgentList() {
  const agents = useAgentStore((state) => state.agents);
  
  return (
    <ul>
      {agents.map((agent) => (
        <li key={agent.name}>{agent.name}</li>
      ))}
    </ul>
  );
}
```

### Svelte

```svelte
<script lang="ts">
  import { agentStore } from 'viber/svelte';
</script>

<ul>
  {#each $agentStore.agents as agent}
    <li>{agent.name}</li>
  {/each}
</ul>
```

## Custom Stores

Create custom stores for your application state:

```typescript
import { create } from 'zustand';

interface ProjectState {
  projects: Project[];
  activeProject: string | null;
  setActiveProject: (id: string) => void;
}

const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  activeProject: null,
  setActiveProject: (id) => set({ activeProject: id }),
}));
```

## Persistence

<Aside type="tip">
  Use Zustand's persist middleware to save state across sessions.
</Aside>

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useSettingsStore = create(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
    }),
    { name: 'viber-settings' }
  )
);
```

## Best Practices

1. **Selective Subscriptions**: Only subscribe to the state slices you need
2. **Derived State**: Use selectors for computed values
3. **Actions in Store**: Keep state mutations inside store actions
4. **Immutable Updates**: Always return new objects when updating state
