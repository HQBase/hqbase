import { defaultAc } from "better-auth/plugins/admin/access";

const managerStatements = {
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update"
  ],
  session: ["list", "revoke", "delete"]
} as const;

const memberStatements = {
  user: [],
  session: []
} as const;

export const ownerRole = defaultAc.newRole(managerStatements);
export const adminRole = defaultAc.newRole(managerStatements);
export const memberRole = defaultAc.newRole(memberStatements);
