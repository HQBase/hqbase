export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
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
