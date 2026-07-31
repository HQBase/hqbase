# Changelog

## 0.1.38

- Restore the desktop and installed PWA mail layout by keeping horizontal resize separators
  vertical, preventing the sidebar and content panels from collapsing after the panel upgrade.

## 0.1.37

- Prime iPhone audio at the start of a pull-to-refresh gesture so the release cue plays without
  requiring a menu tap first.

## 0.1.36

- Show unread Inbox counts for **All mailboxes** and each accessible mailbox in the desktop and
  compact mailbox selectors.
- Retry the mobile pull-to-refresh cue from the trusted release gesture when iPhone has not yet
  confirmed audio playback.

## 0.1.35

- Keep each user's Login email independent from connected workspace email domains so sign-in,
  invitation, and recovery remain available when HQBase mail is unavailable.
- Add seven-day email invitations and server-generated temporary passwords for workspace member
  onboarding, with password setup required before workspace or MCP access.
- Show onboarding status in Settings and let authorized administrators resend pending invitations
  or replace a lost temporary password without exposing stored credentials.

## 0.1.34

- Load conversations in cursor-paged batches with exact filtered totals while preserving already
  loaded history and list position across background refreshes and reader navigation.
- Add native-like mail shell controls, including persistent and resizable desktop panels,
  surface-scoped mobile pull-to-refresh, compact top-tap handling, and a scroll-to-top fallback.
- Keep mailbox filtering and the read-only or mail-actions MCP connection choice available in
  compact navigation with device-safe dialog sizing.
- Play distinct quiet cues when mobile pull-to-refresh reaches its release threshold and when the
  refresh fetch completes, including a first-gesture iOS audio-unlock fallback.

## 0.1.33

- Remove the baked black canvas and padding from the official logo on application, authentication,
  offline, and marketing surfaces.
- Give favicons, Apple touch icons, installable PWA icons, maskable icons, and notification badges
  their own purpose-built framing, with a larger mark on installed app icons.

## 0.1.32

- Replace the application, favicon, and installed PWA branding with the new official square HQBase
  logo.

## 0.1.31

- Let each user choose a default From mailbox during onboarding and in Settings.
- Use that mailbox for new messages and forwards while replies continue from the mailbox that
  received the original message.

## 0.1.30

- Keep compact right-side sheet headers and close controls below the top device safe area.
- Place full-screen new-message, reply, and forward composer headers below the notch or Dynamic
  Island.
- Add device-aware bottom spacing around new-message actions so they clear the home indicator.

## 0.1.29

- Replace the available-update banner with an animated progress status after an update starts, then
  remove it when the replacement application is ready to reload.
- Refine Settings -> Updates with clearer version hierarchy, deployment progress, and the retained
  Cloudflare build reference.
- Play one quiet local notification sound when the new HQBase version is ready to reload.

## 0.1.28

- Reply to or forward any expanded message in a conversation while preserving the existing
  conversation-level actions after the final message.
- Replace the hidden-message divider label with a counted two-arrow control that points outward to
  expand and inward to collapse.

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
