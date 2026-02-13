---
title: "Privacy Policy"
description: "How OpenViber handles your data with our local-first AI platform."
---

# Privacy Policy

**Last updated:** February 13, 2026

## 1. Overview

OpenViber is built on a **local-first** architecture. Your AI agents, files, API keys, and data stay on your machine. This Privacy Policy explains what data we do and do not collect when you use the OpenViber platform and its cloud services.

## 2. Our Local-First Commitment

The core OpenViber daemon runs entirely on your local machine. This means:

- **Your API keys** are stored locally in `~/.openviber/.env` and never transmitted to our servers.
- **Your agent conversations** and task outputs remain on your device.
- **Your files** accessed or created by agents stay on your local filesystem.
- **Terminal sessions** and command outputs are local to your machine.

## 3. Data We Collect

When you use the OpenViber cloud services (the Board), we may collect:

### 3.1 Account Data

- **GitHub profile information**: username, email address, avatar URL — obtained through GitHub OAuth sign-in.
- **Authentication tokens**: session tokens for maintaining your login state.

### 3.2 OAuth Connection Data

- If you connect third-party accounts (e.g., Google for Gmail integration), we store encrypted access and refresh tokens in our database ([Supabase](https://supabase.com)).
- These tokens are encrypted at rest and are used solely to provide the integrations you explicitly enable.

### 3.3 Configuration Data

- **Viber settings**: agent configurations, skill selections, and preferences you save through the Board.
- **Environment configurations**: repository URLs, branch names, and non-secret environment variable keys (not values) when you set up project environments.

### 3.4 Usage Data

- We may collect anonymized, aggregated usage statistics (e.g., feature usage counts, error rates) to improve the Service. This does not include the content of your conversations or agent outputs.

## 4. Data We Do NOT Collect

- Your AI provider API keys (OpenRouter, Anthropic, OpenAI, etc.)
- The content of your agent conversations or prompts
- Files on your local filesystem
- Terminal command outputs
- Browser automation session content
- Any data processed locally by the OpenViber daemon

## 5. How We Use Your Data

We use the data we collect to:

- Authenticate your identity and maintain your session.
- Sync your agent configurations between devices.
- Provide OAuth-based integrations (e.g., Gmail) that you explicitly enable.
- Improve and maintain the Service.

## 6. Data Storage and Security

- Cloud data is stored in [Supabase](https://supabase.com) (hosted on AWS) with row-level security (RLS) policies.
- OAuth tokens are encrypted before storage using application-level encryption.
- All data transmission uses HTTPS/TLS encryption.
- We follow industry-standard security practices to protect your data.

## 7. Third-Party Services

The Service integrates with the following third-party services, each with their own privacy policies:

- **GitHub** — for authentication ([Privacy Policy](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement))
- **Supabase** — for data storage and authentication ([Privacy Policy](https://supabase.com/privacy))
- **Google** — for Gmail and cloud integrations ([Privacy Policy](https://policies.google.com/privacy))

When you use AI providers (OpenRouter, Anthropic, OpenAI, etc.) through OpenViber, your prompts and data are sent directly from your machine to those providers. We do not intercept or store this traffic.

## 8. Data Retention

- **Account data** is retained for as long as your account is active.
- **OAuth tokens** are retained until you disconnect the integration or delete your account.
- **Local data** remains on your machine and is under your sole control.

You can delete your account and all associated cloud data by contacting us through our GitHub repository.

## 9. Your Rights

You have the right to:

- **Access** — request a copy of the data we store about you.
- **Correct** — update your profile information through the Settings page.
- **Delete** — request deletion of your account and associated data.
- **Disconnect** — revoke third-party integrations at any time through Settings > Integrations.
- **Export** — your local data is already in your control on your filesystem.

## 10. Children's Privacy

The Service is not intended for individuals under the age of 13. We do not knowingly collect personal information from children.

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify users of material changes by updating the "Last updated" date. Your continued use of the Service after changes constitutes acceptance of the revised policy.

## 12. Contact

If you have questions about this Privacy Policy or wish to exercise your data rights, please open an issue on our [GitHub repository](https://github.com/dustland/openviber) or contact us at the channels listed there.
