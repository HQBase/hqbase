export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

export async function apiGetPage<T>(
  path: string
): Promise<{ data: T; nextPageUrl: string | null }> {
  const response = await fetch(path, { credentials: "include", method: "GET" });
  const data = (await readResponseJson(response)) as T | ApiError;
  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data ? data.error.message : "Request failed.";
    throw new Error(message);
  }
  return { data: data as T, nextPageUrl: nextPageUrl(response.headers.get("link")) };
}

function nextPageUrl(header: string | null): string | null {
  if (header === null) return null;
  const links = splitLinkHeader(header).map(parseLinkValue);
  return links.find((link) => link.relations.includes("next"))?.target ?? null;
}

function splitLinkHeader(header: string): string[] {
  const values: string[] = [];
  let inTarget = false;
  let inQuotes = false;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < header.length; index += 1) {
    const character = header[index];
    if (inTarget) {
      if (character === ">") inTarget = false;
      continue;
    }
    if (inQuotes) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inQuotes = false;
      continue;
    }
    if (character === "<") inTarget = true;
    else if (character === '"') inQuotes = true;
    else if (character === ",") {
      values.push(header.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(header.slice(start).trim());
  if (inTarget || inQuotes || values.some((value) => value.length === 0)) {
    throw new Error("Malformed Link header.");
  }
  return values;
}

function parseLinkValue(value: string): { relations: string[]; target: string } {
  if (!value.startsWith("<")) throw new Error("Malformed Link header.");
  const targetEnd = value.indexOf(">");
  if (targetEnd < 2) throw new Error("Malformed Link header.");
  const target = value.slice(1, targetEnd);
  const relations: string[] = [];
  let remainder = value.slice(targetEnd + 1);
  while (remainder.trim().length > 0) {
    remainder = remainder.trimStart();
    if (!remainder.startsWith(";")) throw new Error("Malformed Link header.");
    remainder = remainder.slice(1).trimStart();
    const nameEnd = tokenLength(remainder);
    if (nameEnd === 0) throw new Error("Malformed Link header.");
    const name = remainder.slice(0, nameEnd).toLowerCase();
    remainder = remainder.slice(nameEnd).trimStart();
    let parameterValue: string | null = null;
    if (remainder.startsWith("=")) {
      remainder = remainder.slice(1).trimStart();
      if (remainder.startsWith('"')) {
        const quoted = readQuotedValue(remainder);
        parameterValue = quoted.value;
        remainder = quoted.remainder;
      } else {
        const valueEnd = tokenLength(remainder);
        if (valueEnd === 0) throw new Error("Malformed Link header.");
        parameterValue = remainder.slice(0, valueEnd);
        remainder = remainder.slice(valueEnd);
      }
    }
    if (name === "rel") {
      if (parameterValue === null) throw new Error("Malformed Link header.");
      relations.push(...parameterValue.toLowerCase().split(/\s+/u).filter(Boolean));
    }
  }
  return { relations, target };
}

function tokenLength(value: string): number {
  let length = 0;
  while (length < value.length && /[!#$%&'*+\-.^_`|~0-9A-Za-z]/u.test(value[length] ?? "")) {
    length += 1;
  }
  return length;
}

function readQuotedValue(value: string): { remainder: string; value: string } {
  let parsed = "";
  let escaped = false;
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index] ?? "";
    if (escaped) {
      parsed += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      return { remainder: value.slice(index + 1), value: parsed };
    } else {
      parsed += character;
    }
  }
  throw new Error("Malformed Link header.");
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  return apiRequest<T>(path, init);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PATCH"
  });
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "PUT"
  });
}

export async function apiDelete(path: string, body?: unknown): Promise<void> {
  await apiRequest<null>(path, {
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    method: "DELETE"
  });
}

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...init
  });

  const data = (await readResponseJson(response)) as T | ApiError;
  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data ? data.error.message : "Request failed.";
    throw new Error(message);
  }

  return data as T;
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
