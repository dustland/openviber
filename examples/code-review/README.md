# Code Review Example

Collaborative code review with persistent feedback tracking. Issues are tracked across sessions, and fixes are applied iteratively.

## What This Demonstrates

### 1. Iterative Review Process

Code review isn't one-shot—it's iterative:

```bash
Session 1: "Review for security issues"
Session 2: "Now check performance"
Session 3: "Apply the suggested fixes"
Session 4: "Re-review the fixed code"
```

### 2. Issue Tracking

Issues persist across sessions:

```markdown
# issues.md

## Security Review - 2024-01-15

### Critical: SQL Injection in user.ts:45

- Location: `getUserById` function
- Risk: User input directly in query
- Fix: Use parameterized queries

### High: Missing input validation

...
```

### 3. Review History

Complete audit trail:

```markdown
# review-log.md

## Session 1 - 2024-01-15

- Added auth.ts for review
- Added user.ts for review
- Ran security review
- Applied fix: SQL injection in user.ts

## Session 2 - 2024-01-16

- Ran performance review
  ...
```

### 4. Artifact Evolution

Code improves through iterations:

```
user.ts
├── v1: Original code
├── v2: Fixed SQL injection
├── v3: Added input validation
└── v4: Performance optimized
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Set your API key
export OPENAI_API_KEY=sk-...

# Start reviewing
pnpm start
```

## Commands

| Command       | Description                |
| ------------- | -------------------------- |
| `add <file>`  | Add code file for review   |
| `review`      | Comprehensive review       |
| `security`    | Security-focused review    |
| `performance` | Performance-focused review |
| `style`       | Code style review          |
| `fix <issue>` | Apply a fix                |
| `issues`      | List all issues            |
| `summary`     | Generate review summary    |
| `quit`        | Save and exit              |

## Example Session

````
🔍 Code Review Assistant - Viber Demo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 Starting a new code review...

What are you reviewing? Authentication module

✨ Created review space: space_review123

💻 You: add src/auth.ts

✅ Added "auth.ts" for review

💻 You: security

🔍 Running security review...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Security Issues Found

### Critical: Hardcoded API Key (line 12)
The API key is hardcoded in the source code.
**Fix:** Use environment variables.

### High: No Rate Limiting
The login endpoint has no rate limiting.
**Fix:** Implement rate limiting middleware.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💾 Issues updated

💻 You: fix hardcoded API key

🔧 Applying fix for: hardcoded API key

Here's the corrected code:

```typescript
// Before
const API_KEY = "sk-secret123";

// After
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY environment variable required");
}
````

💻 You: quit

💾 Saved! Space ID: space_review123

```

**Next session:**

```

Resume review space_review123? (y/n): y

📊 Review Status:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Files under review: 1

- auth.ts (v2)

Issues found: 2

💻 You: fix rate limiting

🔧 Applying fix for: rate limiting
...

```

## Why This Matters

Traditional code review tools:
- ❌ Issues tracked separately from code
- ❌ No persistent context
- ❌ Manual fix application

Viber Code Review:
- ✅ Issues tracked with code
- ✅ Full review history
- ✅ AI-assisted fixes
- ✅ Iterative improvement


```
