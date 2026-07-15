export const proCheckoutBaseUrl = "https://billing.hqbase.io/buy/pro";

export type ProCheckoutPlacement =
  | "onboarding-domains"
  | "user-permissions"
  | "mail-clients"
  | "composer"
  | "settings-mailboxes";

export function proCheckoutUrl(placement: ProCheckoutPlacement): string {
  const url = new URL(proCheckoutBaseUrl);
  url.searchParams.set("mode", "community_upgrade");
  url.searchParams.set("source", "hqbase-community");
  url.searchParams.set("placement", placement);
  return url.toString();
}
