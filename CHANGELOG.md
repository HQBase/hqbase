# Changelog

## 0.1.19

- Group replies into one inbox conversation using standard email reply headers, while keeping
  unrelated messages with the same subject separate.
- Show the latest conversation activity with aggregate unread, starred, attachment, and message
  count state, and apply inbox actions across the accessible conversation.
- Repair existing subject-grouped message history during the update migration.

## 0.1.18

- Restore notification sounds on iPhone by unlocking a local audio player during the first
  interaction and reusing it for mail and toast sounds.

## 0.1.17

- Preserve sanitized formatting, links, tables, remote image references, and matching inline images
  when quoting an HTML message in a reply.
- Collapse quoted history behind an ellipsis in the HQBase reader for both HTML and plain-text
  messages.
- Show the first and final two messages in longer conversations and place intervening messages
  behind a counted divider.

## 0.1.16

- Include the selected message as quoted HTML and plain text in replies so email clients can
  collapse and expand the previous content.

## 0.1.15

- Send new messages, replies, and forwards with Command+Enter on macOS or Control+Enter elsewhere.
- Keep the account menu below Settings in desktop and mobile sidebars, simplify the mobile toolbar
  to navigation, search, and New email, and present one combined Inbox message list.
- Add quiet, locally generated sounds for new inbound mail, confirmed sends, and toast status while
  keeping loading states silent and honoring reduced-motion preferences.

## 0.1.14

- Keep Cloudflare authorization inside HQBase when the current session is no longer recent.
- Confirm the current HQBase password in the originating update or domain dialog, then continue the
  exact operation without exposing a raw API error.
- Rate-limit and audit successful and denied infrastructure reauthentication attempts.

## 0.1.13

- Default replies to the exact authorized address that received the original message.
- Add editable To, Cc, and Bcc fields to replies across desktop, mobile, the send API, and MCP.
- Mark unread messages read when opened so the unread dot clears from the message list.
- Make empty-body draft autosave revision-safe and reliably return to **Draft saved**.

## 0.1.12

- Add Gmail-style responsive conversations with list-only compact navigation and immersive message
  views.
- Move Reply and Forward below the conversation, with inline desktop editing and a full-screen
  compact editor above the conversation context.
- Preserve Reply and Forward drafts and load authorized chronological conversation threads.
- Fix Compose mailbox selector layering across desktop and mobile.
- Migrate existing Better Auth credential accounts and add the conversation draft schema update.
- Polish deployment progress and post-deploy release verification.

## 0.1.11

- Consolidate HQBase into one public AGPL product.
- Remove editions, product licensing, billing, entitlements, and Community-to-Pro promotion.
- Publish one public signed release and update channel through GitHub Releases.
- Keep customer mail and Cloudflare credentials in customer-owned infrastructure.
