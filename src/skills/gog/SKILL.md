---
name: gog
version: 1.0.0
description: "OpenClaw's Google Workspace CLI for Gmail checking via OAuth."
source: openclaw
openclawSkillId: gog
homepage: https://gogcli.sh
---

# OpenClaw gog (Gmail checking)

This builtin skill is based on the OpenClaw "gog" skill and uses the gog CLI to
check Gmail with OAuth.

## Prerequisites

- Install gog CLI:
  - macOS: `brew install steipete/tap/gogcli`
  - Linux: build from source at https://github.com/steipete/gogcli
- Configure OAuth credentials:
  - `gog auth credentials /path/to/client_secret.json`
  - `gog auth add you@gmail.com --services gmail`
- Optional: `export GOG_ACCOUNT=you@gmail.com` to avoid passing `--account`.

## Tools

- **gog_gmail_search** — Search Gmail threads for a query.
- **gog_gmail_messages_search** — Search individual messages; set `includeBody`
  to fetch message bodies.

## Examples

```ts
gog_gmail_search({ query: "is:unread newer_than:7d", max: 20 });
gog_gmail_messages_search({
  query: "from:alerts@example.com newer_than:1d",
  includeBody: true,
});
```

## Notes

- Uses OAuth via gog CLI (no app password).
- `gog_gmail_messages_search` adds `--include-body` when `includeBody` is true.
- For batch processing, prefer narrower queries and small max values.
