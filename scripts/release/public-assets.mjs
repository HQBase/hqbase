// GitHub can publish release metadata before its download URLs are available at every edge.
export async function fetchPublicAsset(url, options = {}) {
  const fetcher = options.fetcher ?? fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let response;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    response = await fetcher(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
    if (response.status !== 404 && response.status < 500) return response;
    await response.body?.cancel();
    if (attempt < 29) await sleep(2_000);
  }
  throw new Error(`Public release download did not become available (${response.status}).`);
}
