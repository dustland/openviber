---
name: gmail
description: "Search, read, send, and manage Gmail emails via Google API"
requires:
  oauth:
    - provider: google
      scopes:
        - https://www.googleapis.com/auth/gmail.readonly
        - https://www.googleapis.com/auth/gmail.send
        - https://www.googleapis.com/auth/gmail.modify
---

# Gmail

Search, read, send, and manage Gmail emails using the Google Gmail API with OAuth authentication.

## Setup

Connect your Google account via **Settings > Integrations > Google > Connect**.
The OAuth flow requests Gmail read, send, and modify permissions. No app passwords or CLI tools needed.

## Tools

### gmail_search

Search Gmail messages using full Gmail search syntax (same as the Gmail search bar).

**Parameters:**
- `query` (required): Gmail search query (e.g. `is:unread`, `from:alice@example.com newer_than:7d`, `subject:deploy`)
- `maxResults` (optional): Maximum number of messages to return (default: 20, max: 100)

**Returns:** Message IDs, subjects, senders, dates, and snippets.

### gmail_read

Read the full body of a Gmail message by its message ID.

**Parameters:**
- `messageId` (required): Gmail message ID from gmail_search results

**Returns:** Full email with from, to, subject, date, body, and labels.

### gmail_send

Send a plain text email via Gmail.

**Parameters:**
- `to` (required): Recipient email address
- `subject` (required): Email subject line
- `body` (required): Email body (plain text)
- `cc` (optional): CC recipient email address
- `bcc` (optional): BCC recipient email address

### gmail_modify

Modify labels on a Gmail message (mark read/unread, archive, star).

**Parameters:**
- `messageId` (required): Gmail message ID
- `addLabels` (optional): Label IDs to add (e.g. `['STARRED', 'UNREAD']`)
- `removeLabels` (optional): Label IDs to remove (e.g. `['UNREAD', 'INBOX']`)

## Common Gmail Search Queries

- `is:unread` — All unread messages
- `is:starred` — Starred messages
- `from:alice@example.com` — From a specific sender
- `subject:meeting` — Subject contains "meeting"
- `newer_than:7d` — Last 7 days
- `has:attachment` — Messages with attachments
- `in:inbox` — Inbox only
- `label:important` — Important messages
