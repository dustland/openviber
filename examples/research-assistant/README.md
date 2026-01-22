# Research Assistant Example

This example demonstrates Viber's **knowledge accumulation** capabilities. Unlike one-shot research tools, this assistant builds a persistent knowledge base that grows across sessions.

## What This Demonstrates

### 1. Knowledge Accumulation

Research builds up over time:

```
Session 1: "What is quantum computing?"
Session 2: "How does it relate to cryptography?"
Session 3: "What are the current limitations?"
           ↓
Session 4: "Synthesize everything we've learned"
           (Has full context from all sessions!)
```

### 2. Source Management

Add documents to your knowledge base:

```bash
> add paper.pdf
✅ Added "paper.pdf" to knowledge base
The assistant can now reference this document in responses.
```

### 3. Research Synthesis

Generate comprehensive summaries:

```bash
> synthesize

🧪 Synthesizing research findings...

Based on our research across 5 sessions:

## Key Findings
1. Quantum computing threatens current encryption...
2. Post-quantum cryptography is being developed...

## Knowledge Gaps
- Limited data on real-world quantum computer performance
- Need more research on hybrid classical-quantum systems
```

### 4. Artifact-Based Notes

All research is automatically captured:

```
research-workspace/
├── sources.md      # List of all sources
├── notes.md        # Auto-saved research notes
├── paper.pdf       # Uploaded documents
└── synthesis-*.md  # Generated syntheses
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

3. **Start researching**
   ```bash
   pnpm start
   ```

## Commands

| Command      | Description                    |
| ------------ | ------------------------------ |
| `add <file>` | Add document to knowledge base |
| `sources`    | List all sources               |
| `notes`      | Show research notes            |
| `synthesize` | Generate research synthesis    |
| `export`     | Export findings to markdown    |
| `quit`       | Save and exit                  |

## Example Session

```
🔬 Research Assistant - Viber Demo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 Starting a new research project...

What would you like to research? Renewable energy trends

✨ Created research workspace: space_xyz789

🔍 You: What are the main types of renewable energy?

🤖 Researcher: Based on current research, the main types of renewable energy include:

1. **Solar Energy** - Photovoltaic and thermal systems
2. **Wind Energy** - Onshore and offshore turbines
3. **Hydroelectric** - Dams and run-of-river systems
4. **Geothermal** - Heat from Earth's core
5. **Biomass** - Organic materials for fuel

Would you like me to dive deeper into any of these?

🔍 You: add energy-report-2024.pdf

✅ Added "energy-report-2024.pdf" to knowledge base

🔍 You: What does the report say about solar trends?

🤖 Researcher: According to energy-report-2024.pdf, solar energy trends show:
- 25% growth in installations year-over-year
- Cost reduction of 15% for residential systems
- New perovskite technology showing promise...

[Sources: energy-report-2024.pdf, previous research]
```

## Why This Matters

Traditional research tools:

- ❌ Start fresh each session
- ❌ Can't accumulate knowledge
- ❌ No source tracking

Viber Research Assistant:

- ✅ Knowledge persists forever
- ✅ Sources are tracked and cited
- ✅ Research synthesizes automatically
- ✅ Export anytime to markdown
