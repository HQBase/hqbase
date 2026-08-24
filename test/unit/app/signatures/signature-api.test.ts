import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSignature,
  deleteSignature,
  listManagedSignatures,
  listUsableSignatures,
  parseSignatureScope,
  updateSignature
} from "@/features/signatures/api";
import type { Signature } from "@/features/signatures/types";

const signature: Signature = {
  id: "sig_support",
  name: "Support",
  html: "<p>HQBase Support</p>",
  text: "HQBase Support",
  scope: "mailbox",
  scopeId: "mbx_support",
  scopeLabel: "Support · support@example.com",
  isDefault: true,
  createdAt: "2026-08-24T12:00:00.000Z",
  updatedAt: "2026-08-24T12:00:00.000Z"
};

afterEach(() => vi.unstubAllGlobals());

describe("signature API", () => {
  it("loads manageable and exact-address candidate signatures", async () => {
    const candidates = { automaticSignatureId: signature.id, signatures: [signature] };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([signature]))
      .mockResolvedValueOnce(Response.json(candidates));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listManagedSignatures()).resolves.toEqual([signature]);
    await expect(listUsableSignatures("support+one@example.com")).resolves.toEqual(candidates);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/signatures", {
      credentials: "include",
      method: "GET"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v2/signatures?from=support%2Bone%40example.com",
      { credentials: "include", method: "GET" }
    );
  });

  it("uses the installed-app management routes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(signature))
      .mockResolvedValueOnce(Response.json({ ...signature, name: "Updated" }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const input = {
      name: "Support",
      html: "<p>HQBase Support</p>",
      scope: { type: "mailbox" as const, id: "mbx_support" },
      isDefault: true
    };

    await createSignature(input);
    await updateSignature(signature.id, {
      name: "Updated",
      html: signature.html,
      isDefault: false
    });
    await deleteSignature(signature.id);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/signatures", {
      body: JSON.stringify(input),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/signatures/sig_support", {
      body: JSON.stringify({ name: "Updated", html: signature.html, isDefault: false }),
      credentials: "include",
      headers: { "content-type": "application/json" },
      method: "PATCH"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/signatures/sig_support", {
      credentials: "include",
      method: "DELETE"
    });
  });

  it("accepts only exact supported scope values", () => {
    expect(parseSignatureScope("domain:dom_example")).toEqual({
      type: "domain",
      id: "dom_example"
    });
    expect(() => parseSignatureScope("workspace:any")).toThrow("Choose a signature scope.");
  });
});
