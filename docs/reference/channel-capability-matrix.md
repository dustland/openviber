# Channel Capability Matrix

This matrix is generated from built-in channel registry metadata. Run `pnpm docs:channels` after capability updates.

| Channel | Display name | Transport | Inbound attachments | Auth summary | Controls | Production readiness |
|---|---|---|---|---|---|---|
| `dingtalk` | DingTalk | `webhook` | no | appKey + appSecret (+ optional robotCode) | — | ready |
| `discord` | Discord | `websocket` | yes | botToken (+ optional appId) | allowGuildIds, allowChannelIds, allowUserIds, requireMention, replyMode | ready |
| `feishu` | Feishu | `websocket` | yes | appId + appSecret (+ optional verification/encryption keys) | allowGroupMessages, requireMention | ready |
| `web` | Web | `sse` | yes | session-based web app context | — | ready |
| `wecom` | WeCom | `webhook` | no | corpId + agentId + secret + token + aesKey | — | ready |

## Source

- `src/channels/registry.ts`
- `src/channels/builtin.ts`
