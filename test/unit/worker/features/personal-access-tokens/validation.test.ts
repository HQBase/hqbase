import { describe, expect, it } from "vitest";
import {
  readCreatePersonalAccessTokenInput,
  readPersonalAccessTokenMetadata
} from "../../../../../worker/features/personal-access-tokens/validation";
import { AppError } from "../../../../../worker/lib/errors";

const now = Date.parse("2026-08-20T18:00:00.000Z");

describe("personal access token create input", () => {
  it.each([
    { name: "a", expected: "a" },
    { name: "  Nightly archive  ", expected: "Nightly archive" },
    { name: "n".repeat(80), expected: "n".repeat(80) }
  ])("accepts and trims a valid name", ({ expected, name }) => {
    expect(readCreatePersonalAccessTokenInput({ expiresAt: null, name }, now)).toEqual({
      name: expected,
      expiresAt: null
    });
  });

  it("accepts a canonical future expiry", () => {
    expect(
      readCreatePersonalAccessTokenInput(
        { name: "Canonical", expiresAt: "2026-11-17T18:00:00.000Z" },
        now
      )
    ).toEqual({
      name: "Canonical",
      expiresAt: "2026-11-17T18:00:00.000Z"
    });
  });

  it("canonicalizes a parseable future expiry", () => {
    expect(
      readCreatePersonalAccessTokenInput(
        { name: "Local time", expiresAt: "2026-11-17T12:00:00-06:00" },
        now
      )
    ).toEqual({
      name: "Local time",
      expiresAt: "2026-11-17T18:00:00.000Z"
    });
  });

  it.each([
    { label: "null body", value: null },
    { label: "array body", value: [] },
    { label: "missing name", value: { expiresAt: null } },
    { label: "empty name", value: { name: "", expiresAt: null } },
    { label: "blank name", value: { name: "   ", expiresAt: null } },
    { label: "long name", value: { name: "n".repeat(81), expiresAt: null } },
    { label: "wrong expiry type", value: { name: "Token", expiresAt: 1 } },
    { label: "invalid expiry", value: { name: "Token", expiresAt: "not-a-date" } },
    {
      label: "expiry equality",
      value: { name: "Token", expiresAt: "2026-08-20T18:00:00.000Z" }
    },
    {
      label: "past expiry",
      value: { name: "Token", expiresAt: "2026-08-20T17:59:59.999Z" }
    },
    { label: "unknown field", value: { name: "Token", expiresAt: null, scope: "mail:read" } }
  ])("rejects invalid create input: $label", ({ value }) => {
    expectInvalidCreateInput(() => readCreatePersonalAccessTokenInput(value, now));
  });
});

describe("personal access token metadata", () => {
  it("returns only validated management metadata", () => {
    const row = {
      ...validMetadataRow(),
      token: "not-a-secret",
      tokenHash: "not-a-hash",
      revokedAt: null,
      status: "active"
    };
    const metadata = readPersonalAccessTokenMetadata(row);
    expect(metadata).toEqual(validMetadataRow());
    expect(Object.keys(metadata)).toEqual([
      "id",
      "userId",
      "ownerName",
      "name",
      "tokenSuffix",
      "createdAt",
      "expiresAt"
    ]);
  });

  it.each([
    { label: "PAT ID scalar", field: "id", value: 1 },
    { label: "PAT ID format", field: "id", value: "token_example" },
    { label: "empty user ID", field: "userId", value: "" },
    { label: "user ID scalar", field: "userId", value: 1 },
    { label: "owner name scalar", field: "ownerName", value: 1 },
    { label: "blank token name", field: "name", value: "" },
    { label: "untrimmed token name", field: "name", value: " Token " },
    { label: "long token name", field: "name", value: "n".repeat(81) },
    { label: "short suffix", field: "tokenSuffix", value: "abc" },
    { label: "suffix alphabet", field: "tokenSuffix", value: "abc+" },
    { label: "creation scalar", field: "createdAt", value: 1 },
    { label: "creation format", field: "createdAt", value: "2026-08-20T18:00:00Z" },
    { label: "expiry scalar", field: "expiresAt", value: 1 },
    { label: "expiry format", field: "expiresAt", value: "2026-11-17T12:00:00-06:00" }
  ])("rejects malformed stored metadata: $label", ({ field, value }) => {
    const error = captureError(() =>
      readPersonalAccessTokenMetadata({ ...validMetadataRow(), [field]: value })
    );
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.status).toBe(500);
  });
});

function validMetadataRow() {
  return {
    id: "pat_example",
    userId: "usr_example",
    ownerName: "Workspace Owner",
    name: "Nightly archive",
    tokenSuffix: "a1B2",
    createdAt: "2026-08-20T18:00:00.000Z",
    expiresAt: "2026-11-17T18:00:00.000Z"
  };
}

function expectInvalidCreateInput(operation: () => unknown): void {
  const error = captureError(operation);
  expect(error.code).toBe("INVALID_PERSONAL_ACCESS_TOKEN");
  expect(error.status).toBe(400);
  expect(error.message).toBe("Personal access token input is invalid.");
}

function captureError(operation: () => unknown): AppError {
  try {
    operation();
  } catch (error) {
    if (error instanceof AppError) return error;
  }
  throw new Error("Expected an AppError.");
}
