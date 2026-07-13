import type { WorkspaceRole } from "../lib/validation";

export function canManageSetup(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

export function canManageUsers(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

export function canManageMailboxes(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}

export function canReadMail(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin" || role === "member";
}

export function canSendMail(role: WorkspaceRole): boolean {
  return canReadMail(role);
}
