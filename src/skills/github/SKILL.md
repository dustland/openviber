---
name: github
version: 1.0.0
description: GitHub operations via gh CLI — list issues, create branches, create PRs, clone repos.
---

# GitHub Skill

Interact with GitHub repositories using the `gh` CLI. Use these tools for automated workflows like issue triage, bug fixing, and PR creation.

## Prerequisites

- `gh` CLI installed (`brew install gh`)
- Authenticated: `gh auth login`

## Tools

- **gh_list_issues** — List open issues for a repository
- **gh_get_issue** — Get full details of a specific issue
- **gh_create_branch** — Create and checkout a new branch in a local repo
- **gh_create_pr** — Create a pull request from the current branch
- **gh_clone_repo** — Clone a repository into a workspace directory
- **gh_commit_and_push** — Stage all changes, commit with a message, and push to remote

## Automated Workflow

For autonomous issue-fixing, chain the tools:

1. `gh_list_issues` → pick the first open issue
2. `gh_clone_repo` → clone into a workspace (or `cd` to existing clone)
3. `gh_create_branch` → create a fix branch (`fix/issue-123`)
4. Use `codex_run` (codex-cli skill) to fix the issue
5. `gh_commit_and_push` → commit the fix
6. `gh_create_pr` → create a PR referencing the issue
7. `notify` → tell the human

## When to use

- Checking issues to fix
- Creating branches and PRs programmatically
- Any GitHub operation from the viber
