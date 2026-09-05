CREATE TRIGGER send_operations_require_draft BEFORE INSERT ON send_operations
WHEN NEW.draft_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM drafts WHERE id = NEW.draft_id AND principal_id IS NEW.principal_id
)
BEGIN SELECT RAISE(ABORT, 'draft was removed before send'); END;

CREATE TRIGGER drafts_before_update_pending_send BEFORE UPDATE ON drafts
WHEN EXISTS (SELECT 1 FROM send_operations WHERE draft_id = OLD.id AND status <> 'stored')
BEGIN SELECT RAISE(ABORT, 'draft send is pending'); END;

CREATE TRIGGER drafts_before_delete_pending_send BEFORE DELETE ON drafts
WHEN EXISTS (SELECT 1 FROM send_operations WHERE draft_id = OLD.id AND status <> 'stored')
BEGIN SELECT RAISE(ABORT, 'draft send is pending'); END;

CREATE TRIGGER draft_attachments_before_update_pending_send BEFORE UPDATE ON draft_attachments
WHEN EXISTS (SELECT 1 FROM send_operations WHERE draft_id = OLD.draft_id AND status <> 'stored')
BEGIN SELECT RAISE(ABORT, 'draft send is pending'); END;

CREATE TRIGGER draft_attachments_before_delete_pending_send BEFORE DELETE ON draft_attachments
WHEN EXISTS (SELECT 1 FROM send_operations WHERE draft_id = OLD.draft_id AND status <> 'stored')
BEGIN SELECT RAISE(ABORT, 'draft send is pending'); END;

CREATE TRIGGER draft_attachments_before_insert_pending_send BEFORE INSERT ON draft_attachments
WHEN EXISTS (SELECT 1 FROM send_operations WHERE draft_id = NEW.draft_id AND status <> 'stored')
BEGIN SELECT RAISE(ABORT, 'draft send is pending'); END;

CREATE TRIGGER draft_labels_before_update_pending_send BEFORE UPDATE ON draft_labels
WHEN EXISTS (SELECT 1 FROM send_operations WHERE draft_id = OLD.draft_id AND status <> 'stored')
BEGIN SELECT RAISE(ABORT, 'draft send is pending'); END;

CREATE TRIGGER draft_labels_before_delete_pending_send BEFORE DELETE ON draft_labels
WHEN EXISTS (SELECT 1 FROM send_operations WHERE draft_id = OLD.draft_id AND status <> 'stored')
BEGIN SELECT RAISE(ABORT, 'draft send is pending'); END;

CREATE TRIGGER draft_labels_before_insert_pending_send BEFORE INSERT ON draft_labels
WHEN EXISTS (SELECT 1 FROM send_operations WHERE draft_id = NEW.draft_id AND status <> 'stored')
BEGIN SELECT RAISE(ABORT, 'draft send is pending'); END;
