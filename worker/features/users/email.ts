import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";

type PasswordEmailUser = {
  id: string;
  email: string;
  name: string;
};

export async function sendPasswordSetupEmail(
  env: WorkerEnv,
  input: { user: PasswordEmailUser; url: string }
): Promise<void> {
  const [sender, onboarding] = await Promise.all([
    invitationSender(env.DB),
    env.DB.prepare("SELECT method, status FROM user_onboarding WHERE user_id = ?")
      .bind(input.user.id)
      .first<{ method: "email_invite" | "temporary_password"; status: "pending" | "complete" }>()
  ]);
  if (!sender) {
    throw new AppError(
      "INVITATION_SENDER_UNAVAILABLE",
      "Connect an active sending mailbox before inviting users.",
      409
    );
  }

  const invitation = onboarding?.method === "email_invite" && onboarding.status === "pending";
  const action = invitation ? "Accept invitation" : "Reset password";
  const subject = invitation ? "You’ve been invited to HQBase" : "Reset your HQBase password";
  const greeting = input.user.name.trim() ? `Hi ${input.user.name.trim()},` : "Hi,";
  const text = [
    greeting,
    "",
    invitation
      ? "You’ve been invited to join an HQBase workspace."
      : "A password reset was requested for your HQBase account.",
    `${action}: ${input.url}`,
    "",
    "This link expires in seven days and can only be used once."
  ].join("\n");

  await env.MAIL_SENDER.send({
    from: { name: "HQBase", email: sender },
    to: input.user.email,
    subject,
    text,
    html: passwordEmailHtml({ action, greeting, invitation, url: input.url })
  });

  if (invitation) {
    const timestamp = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE user_onboarding
       SET invitation_sent_at = ?, updated_at = ?
       WHERE user_id = ? AND status = 'pending'`
    )
      .bind(timestamp, timestamp, input.user.id)
      .run();
  }
}

async function invitationSender(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT address.address
       FROM mailbox_addresses address
       JOIN mailboxes mailbox ON mailbox.id = address.mailbox_id
       JOIN mail_domains domain ON domain.id = address.mail_domain_id
       WHERE mailbox.is_active = 1
         AND address.send_enabled = 1
         AND domain.is_enabled = 1
         AND domain.sending_status = 'ready'
       ORDER BY address.is_primary DESC, mailbox.created_at ASC, address.address ASC
       LIMIT 1`
    )
    .first<{ address: string }>();
  return row?.address ?? null;
}

function passwordEmailHtml(input: {
  action: string;
  greeting: string;
  invitation: boolean;
  url: string;
}): string {
  const description = input.invitation
    ? "You’ve been invited to join an HQBase workspace."
    : "A password reset was requested for your HQBase account.";
  return `<p>${escapeHtml(input.greeting)}</p>
<p>${escapeHtml(description)}</p>
<p><a href="${escapeHtml(input.url)}">${escapeHtml(input.action)}</a></p>
<p>This link expires in seven days and can only be used once.</p>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character
  );
}
