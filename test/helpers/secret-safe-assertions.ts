import { inspect } from "node:util";

export function assertSecretSafeEqual(actual: string, expected: string): void {
  if (actual !== expected) throw new Error("Secret-safe equality assertion failed.");
}

export function assertSecretSafeAbsent(value: unknown, forbidden: readonly string[]): void {
  const inspected =
    typeof value === "string"
      ? value
      : inspect(value, {
          customInspect: false,
          depth: null,
          getters: false,
          maxArrayLength: null,
          maxStringLength: null
        });
  if (forbidden.some((secret) => secret.length > 0 && inspected.includes(secret))) {
    throw new Error("Secret-safe exclusion assertion failed.");
  }
}
