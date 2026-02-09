---
name: gmail
description: "Read, search, and send emails via Gmail. Used with email-watcher for autonomous email-driven workflows."
---

# Gmail Skill

Provides tools for interacting with a Gmail mailbox via IMAP and SMTP.

## Environment Variables

- `GMAIL_ADDRESS` — Gmail address
- `GMAIL_APP_PASSWORD` — Google App Password (generate at https://myaccount.google.com/apppasswords)

## Tools

### gmail_search

Search for emails matching a query. Returns subject, from, date, and message UID.

**Parameters:**
- `query` (string) — Search terms to match against sender and subject
- `limit` (number, optional) — Max results (default: 10)
- `unreadOnly` (boolean, optional) — Only return unread emails (default: true)

### gmail_read

Read the full body of an email by its UID.

**Parameters:**
- `uid` (number) — Message UID from gmail_search results

### gmail_send

Send an email via SMTP.

**Parameters:**
- `to` (string) — Recipient email address
- `subject` (string) — Email subject
- `body` (string) — Email body (plain text)

## Usage with Email Watcher

The email-watcher daemon monitors Gmail for emails matching rules in `~/.openviber/email-rules.yaml`.
When a match triggers, the viber can use these tools to read the full email body and send status reports.

```yaml
# ~/.openviber/email-rules.yaml
rules:
  - when: "deployment failure from railway"
    do: "diagnose and fix the build error"
```
