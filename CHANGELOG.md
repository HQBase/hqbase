# Changelog

## 0.1.27

- Show a private Drafts destination in desktop and mobile navigation only when the signed-in user
  has saved drafts.
- List saved drafts with mailbox and search filtering, and reopen the exact new-message, reply, or
  forward draft with its attachments and conversation context.
- Keep the Drafts count synchronized when a composer creates, sends, or discards a draft.

## 0.1.26

- Expand the OAuth-protected MCP server with conversation, thread, and attachment retrieval plus
  message and conversation state updates.
- Add complete MCP draft management, staged attachments, rich-text sending and replies, and
  forwarding with original attachments.
- Grant new MCP clients the complete mail scope set by default while preserving explicit
  least-privilege connections and requiring existing clients to reconnect for broader consent.

## 0.1.25

- Keep manually forwarded Gmail messages visible in the reader while continuing to collapse genuine
  quoted reply history.

## 0.1.24

- Consolidate conversation, unread-count, and incoming-mail refreshes into one coordinated path.
- Replace broad incoming-message polling with an access-scoped latest-message status query.
- Split signed deployment responsibilities and strengthen architecture and lifecycle coverage gates.

## 0.1.23

- Add explicit per-device Web Push notifications for installed iOS, Android, and desktop PWAs.
- Show exact accessible Inbox and Catch-all unread totals in navigation, the document title, and
  supported installed-app badges.
- Generate customer-owned VAPID secrets during installation and updates while keeping notification
  payloads free of mail metadata.

## 0.1.22

- Keep the mobile and installed PWA shell below the iPhone Dynamic Island while preserving the
  shell background through the top safe area.

## 0.1.21

- Use the official HQBase logo for the signed-out screen, favicon, and installed PWA icons.
- Refine sidebar and dropdown controls with slimmer icons and clearer account-section separation.
- Keep the mobile drawer within iPhone safe areas and prevent form fields from zooming on focus.

## 0.1.20

- Hide the available-update banner and duplicate install action after Cloudflare accepts the update
  build.
- Check for signed releases when HQBase opens, returns to the foreground, and periodically while it
  remains open.
- Detect the replacement application worker during an active update and show the reload prompt
  without requiring a manual browser refresh.

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
