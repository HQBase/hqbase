import { AppError } from "../../lib/errors";
import { cloudflare } from "./cloudflare";

type ZonePage = {
  result: Array<{ name: string; account: { id: string } }>;
  result_info?: { total_pages?: number };
};

export async function findZoneAccount(
  domain: string,
  headers: HeadersInit,
  fetcher: typeof fetch
): Promise<string> {
  let match: ZonePage["result"][number] | undefined;
  for (let page = 1; page <= 1_000; page += 1) {
    const zones = await cloudflare<ZonePage>(
      `https://api.cloudflare.com/client/v4/zones?per_page=50${page === 1 ? "" : `&page=${page}`}`,
      { headers },
      fetcher,
      "read_zones"
    );
    for (const zone of zones.result) {
      if (
        (domain === zone.name || domain.endsWith(`.${zone.name}`)) &&
        (!match || zone.name.length > match.name.length)
      )
        match = zone;
    }
    if (zones.result.length < 50 || page >= (zones.result_info?.total_pages ?? Infinity)) {
      if (match) return match.account.id;
      throw new AppError(
        "UPDATE_ACCOUNT_NOT_FOUND",
        "No accessible zone matches the workspace portal.",
        403
      );
    }
  }
  throw new AppError(
    "UPDATE_ZONE_LIMIT",
    "Zone discovery exceeded its limit. Use a token scoped to the workspace zone.",
    503
  );
}
