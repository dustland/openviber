# Thesis Writer Example

This example demonstrates Viber's core capability: **persistent workspaces where documents evolve through continuous collaboration across sessions**.

## What This Demonstrates

### 1. Multi-Session Persistence

Unlike traditional AI assistants that forget everything after each conversation, Viber maintains complete context across sessions:

```bash
# Day 1: Start your thesis
pnpm start
> "Write the introduction chapter"

# Day 2: Continue where you left off
pnpm start
> "Make the introduction more concise"
# XAgent remembers everything from Day 1!
```

### 2. Artifact Evolution

Your thesis isn't just created—it evolves:

```
thesis.md
├── v1: Initial draft
├── v2: More concise introduction
├── v3: Added citations
└── v4: Final polish
```

### 3. Context Accumulation

Each conversation builds on previous ones:

```
Session 1: "Research climate change impacts"
Session 2: "Focus on agriculture" (knows about climate change)
Session 3: "Write conclusions" (knows everything discussed)
```

### 4. Plan Adaptation

The plan evolves based on your feedback:

```
Initial Plan:
1. Research → 2. Outline → 3. Draft → 4. Review

After feedback "Skip outline, I have one":
1. Research → 2. Draft (use existing outline) → 3. Review
```

## Getting Started

1. **Set up environment**

   ```bash
   cp .env.example .env
   # Add your OPENAI_API_KEY
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Start writing**
   ```bash
   pnpm start
   ```

## Commands

| Command     | Description           |
| ----------- | --------------------- |
| `status`    | Show current progress |
| `artifacts` | List all documents    |
| `history`   | Show version history  |
| `plan`      | Show current plan     |
| `quit`      | Save and exit         |

## Example Session

```
🎓 Thesis Writer - Viber Demo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 Starting a new thesis project...

What is your thesis topic? The impact of AI on education

✨ Created new workspace: space_abc123

📝 You: Write an outline for my thesis

🤖 X: I'll create an outline for your thesis on "The impact of AI on education"...

[Creates thesis-outline.md v1]

📝 You: Now write the introduction

🤖 X: Based on our outline, I'll write the introduction chapter...

[Creates thesis.md v1]

📝 You: quit

💾 Saving workspace...
✅ Workspace saved! Space ID: space_abc123
```

**Next day:**

```
🎓 Thesis Writer - Viber Demo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📂 Found existing space: space_abc123
Resume previous session? (y/n): y

⏳ Resuming your thesis workspace...

📋 Mission: Write a thesis on: The impact of AI on education
📊 Progress: 25%
📄 Artifacts: 2

📝 You: Make the introduction more engaging

🤖 X: I'll revise the introduction to be more engaging. Looking at the current version...

[Updates thesis.md to v2]
```

## Why This Matters

Traditional AI tools:

- ❌ Forget context after each session
- ❌ Can't track document versions
- ❌ No persistent workspace

Viber:

- ✅ Complete context preserved forever
- ✅ Full version history of every document
- ✅ Pick up exactly where you left off
- ✅ Plans adapt to your feedback
