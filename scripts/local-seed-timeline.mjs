export function buildSeedTimeline(seedDate) {
  const now = seedDate.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const isoBefore = (duration) => new Date(now - duration).toISOString();

  return {
    now: new Date(now).toISOString(),
    workspaceCreated: isoBefore(120 * day),
    projectReceived: isoBefore(2 * hour),
    projectReply: isoBefore(hour),
    invoiceReceived: isoBefore(26 * hour),
    invoiceStarred: isoBefore(26 * hour - 5 * minute),
    salesReceived: isoBefore(50 * hour),
    salesRead: isoBefore(50 * hour - 5 * minute),
    salesArchived: isoBefore(50 * hour - 10 * minute),
    draftCreated: isoBefore(30 * minute),
    draftUpdated: isoBefore(10 * minute),
    onboardingReceived: isoBefore(3 * hour),
    onboardingRead: isoBefore(3 * hour - 2 * minute),
    hiringReceived: isoBefore(5 * hour),
    hiringReply: isoBefore(4 * hour + 30 * minute),
    partnershipReceived: isoBefore(8 * hour),
    partnershipStarred: isoBefore(8 * hour - 3 * minute),
    outageReceived: isoBefore(12 * hour),
    outageRead: isoBefore(11 * hour + 45 * minute),
    newsletterReceived: isoBefore(18 * hour),
    newsletterTrashed: isoBefore(17 * hour + 50 * minute),
    communityReceived: isoBefore(28 * hour),
    communityReply: isoBefore(27 * hour),
    communityFollowUp: isoBefore(26 * hour + 30 * minute),
    vendorReceived: isoBefore(36 * hour),
    vendorArchived: isoBefore(35 * hour + 45 * minute),
    supportThreadReceived: isoBefore(6 * hour),
    supportThreadReply: isoBefore(5 * hour + 30 * minute),
    supportThreadFollowUp: isoBefore(4 * hour + 30 * minute),
    supportThreadResolved: isoBefore(4 * hour),
    billingReceived: isoBefore(22 * hour),
    billingStarred: isoBefore(22 * hour - 2 * minute),
    helloReceived: isoBefore(40 * hour),
    helloRead: isoBefore(39 * hour + 50 * minute),
    catchallReceived: isoBefore(44 * hour),
    securityReceived: isoBefore(14 * hour),
    securityStarred: isoBefore(14 * hour - 2 * minute),
    welcomeReceived: isoBefore(9 * hour),
    welcomeRead: isoBefore(8 * hour + 55 * minute),
    draftHiringCreated: isoBefore(45 * minute),
    draftHiringUpdated: isoBefore(15 * minute),
    draftProposalCreated: isoBefore(25 * minute),
    draftProposalUpdated: isoBefore(5 * minute)
  };
}
