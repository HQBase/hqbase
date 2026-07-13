export const proCheckoutBaseUrl =
  "https://buy.polar.sh/polar_cl_ayTJJnuELUw2gsaggpVqpAarzjvRYCvskb3IH1Ztvge";

export type ProCheckoutPlacement =
  | "onboarding-domains"
  | "user-permissions"
  | "mail-clients"
  | "composer"
  | "settings-mailboxes";

export function proCheckoutUrl(placement: ProCheckoutPlacement): string {
  const url = new URL(proCheckoutBaseUrl);
  url.searchParams.set("utm_source", "hqbase-community");
  url.searchParams.set("utm_medium", "product");
  url.searchParams.set("utm_campaign", "community-upgrade");
  url.searchParams.set("utm_content", placement);
  return url.toString();
}
