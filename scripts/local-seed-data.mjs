export const seedVersion = "local-demo-v4";

export const bulkBuckets = [
  { days: 7, count: 25 },
  { days: 21, count: 25 },
  { days: 30, count: 25 },
  { days: 90, count: 25 }
];

export const bulkSubjects = [
  "Re: Quarterly planning",
  "Invoice follow-up",
  "Support request: login issue",
  "Partnership opportunity",
  "Weekly status report",
  "Onboarding checklist",
  "Security review findings",
  "Ops maintenance notice",
  "Billing adjustment",
  "Feature request",
  "Customer feedback",
  "Hiring pipeline update",
  "Vendor contract renewal",
  "Marketing campaign draft",
  "Product roadmap review",
  "Incident follow-up",
  "Design review",
  "Sales pipeline",
  "Community newsletter",
  "Catchall inquiry"
];

export const bulkSenders = [
  "alex@customer.test",
  "billing@vendor.test",
  "alerts@infra.test",
  "partner@business.test",
  "talent@agency.test",
  "finance@vendor.test",
  "security@audit.test",
  "community@forum.test",
  "marketing@launch.test",
  "vendor@contracts.test",
  "noreply@updates.test",
  "ops-team@external.test",
  "support@client.test",
  "sales@partner.test",
  "hr@agency.test",
  "design@studio.test",
  "product@vendor.test",
  "legal@firm.test",
  "random@external.test",
  "welcome@hqbase.test"
];

export const users = [
  { id: "usr_local_owner", email: "owner@hqbase.test", name: "Local Owner", role: "owner" },
  { id: "usr_local_admin", email: "admin@hqbase.test", name: "Ava Admin", role: "admin" },
  {
    id: "usr_local_member",
    email: "member@hqbase.test",
    name: "Morgan Member",
    role: "member"
  },
  { id: "usr_local_viewer", email: "agent@hqbase.test", name: "Casey Agent", role: "member" }
];

export const owner = users[0];

export const domains = [
  { id: "dom_local_demo", name: "example.test", catchAllPolicy: "reject" },
  { id: "dom_local_ops", name: "ops.example.test", catchAllPolicy: "mailbox" }
];

export const domain = domains[0];

export const mailboxes = [
  {
    id: "mbx_local_support",
    address: "support@example.test",
    domainId: domains[0].id,
    displayName: "Support"
  },
  {
    id: "mbx_local_sales",
    address: "sales@example.test",
    domainId: domains[0].id,
    displayName: "Sales"
  },
  {
    id: "mbx_local_ops",
    address: "ops@ops.example.test",
    domainId: domains[1].id,
    displayName: "Ops"
  },
  {
    id: "mbx_local_info",
    address: "info@example.test",
    domainId: domains[0].id,
    displayName: "Info"
  },
  {
    id: "mbx_local_billing",
    address: "billing@example.test",
    domainId: domains[0].id,
    displayName: "Billing"
  },
  {
    id: "mbx_local_noreply",
    address: "noreply@example.test",
    domainId: domains[0].id,
    displayName: "No Reply"
  },
  {
    id: "mbx_migrated_addr_local_support_alias",
    address: "help@example.test",
    domainId: domains[0].id,
    displayName: "Help"
  },
  {
    id: "mbx_migrated_addr_local_ops_catchall",
    address: "catchall@ops.example.test",
    domainId: domains[1].id,
    displayName: "Ops Catch-all"
  }
];
