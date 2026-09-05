export const pendingSendGuards = [
  "send_operations_require_draft",
  "drafts_before_update_pending_send",
  "drafts_before_delete_pending_send",
  "draft_attachments_before_update_pending_send",
  "draft_attachments_before_delete_pending_send",
  "draft_attachments_before_insert_pending_send",
  "draft_labels_before_update_pending_send",
  "draft_labels_before_delete_pending_send",
  "draft_labels_before_insert_pending_send"
] as const;

export const normalMigrationNames = [
  "0001_initial.sql",
  "0002_workspace.sql",
  "0003_oauth_resources.sql",
  "0004_conversations.sql",
  "0005_rebuild_threads.sql",
  "0006_push_notifications.sql",
  "0007_user_mail_preferences.sql",
  "0008_user_onboarding.sql",
  "0009_login_email_domain_isolation.sql",
  "0010_oauth_device_authorization.sql",
  "0011_latest_password_reset_token.sql",
  "0012_message_activity_index.sql",
  "0013_message_changes.sql",
  "0014_unassigned_messages.sql",
  "0015_draft_changes.sql",
  "0016_one_address_per_mailbox.sql",
  "0017_agent_principals.sql",
  "0018_mailbox_lifecycle.sql",
  "0019_contacts.sql",
  "0020_labels.sql",
  "0021_email_signatures.sql",
  "0022_login_email_domain_exact_match.sql",
  "0023_message_sender_names.sql",
  "0024_draft_inline_images.sql",
  "0025_activate_catch_all_policy.sql",
  "0026_domain_disconnect.sql",
  "0027_message_attachment_disposition.sql",
  "0028_draft_labels.sql",
  "0029_mail_reliability.sql"
] as const;

export const afterDeployMigrationNames = [
  "0001_remove_mailbox_alias_storage.sql",
  "0002_finalize_agent_principals.sql",
  "0003_finalize_draft_labels.sql",
  "0004_mail_reliability_guards.sql"
] as const;
