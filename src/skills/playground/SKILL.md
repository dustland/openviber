---
name: skill-playground
version: 0.1.0
description: Run built-in playground scenarios to verify skills are wired up.
author: OpenViber
---

# Skill Playground

Use this skill when you need to explicitly verify that a skill works end-to-end.
It runs a predefined playground scenario associated with a skill (if present).

## Tool: skill_playground_verify

The `skill_playground_verify` tool:

- Loads the skill's playground definition (from SKILL.md frontmatter)
- Clones or updates a public repo if needed
- Runs the skill in a safe, read-only verification task

Example:

```
skill_playground_verify({ skillId: "cursor-agent" })
```
