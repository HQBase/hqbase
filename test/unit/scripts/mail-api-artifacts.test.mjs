import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const openApi = JSON.parse(await readFile("api/hqbase-mail-api-v2.openapi.json", "utf8"));
const postman = JSON.parse(
  await readFile("api/hqbase-mail-api-v2.postman_collection.json", "utf8")
);
const v1OpenApi = JSON.parse(await readFile("api/hqbase-mail-api-v1.openapi.json", "utf8"));
const v1Postman = JSON.parse(
  await readFile("api/hqbase-mail-api-v1.postman_collection.json", "utf8")
);

describe("Mail API public artifacts", () => {
  it("publishes the versioned endpoint and scope matrix without internal storage keys", () => {
    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.info.version).toBe("2.0.0");
    expect(Object.keys(openApi.paths).every((path) => path.startsWith("/api/v2/"))).toBe(true);
    expect(openApi.components.schemas.MailboxAddress).toBeUndefined();
    expect(openApi.components.schemas.Mailbox.properties.addresses).toBeUndefined();
    expect(openApi.paths["/api/v2/messages"].get.security).toContainEqual({
      oauth2: ["mail:read"]
    });
    expect(openApi.paths["/api/v2/changes"].get.security).toContainEqual({
      oauth2: ["mail:read"]
    });
    expect(openApi.paths["/api/v2/messages"].get.security).toContainEqual({ agentBearer: [] });
    expect(openApi.paths["/api/v2/messages"].get["x-hqbase-agent-capabilities"]).toEqual([
      "mail:read"
    ]);
    expect(openApi.components.securitySchemes.agentBearer).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "hqb_agent_<secret>"
    });
    expect(openApi.components.schemas.Mailbox.required).toContain("deletedAt");
    expect(openApi.paths["/api/v2/events"].get.security).toContainEqual({
      oauth2: ["mail:read"]
    });
    expect(openApi.paths["/api/v2/events"].get.responses["101"]).toBeDefined();
    expect(openApi.paths["/api/v2/drafts/changes"].get.security).toContainEqual({
      oauth2: ["mail:send"]
    });
    expect(openApi.components.schemas.MessageChangePage.required).toEqual([
      "changes",
      "nextCursor",
      "hasMore"
    ]);
    expect(openApi.components.schemas.DraftChangePage.required).toEqual([
      "changes",
      "nextCursor",
      "hasMore"
    ]);
    expect(openApi.paths["/api/v2/messages/{id}/{action}"].post.security).toContainEqual({
      oauth2: ["mail:write"]
    });
    expect(openApi.paths["/api/v2/send"].post.security).toContainEqual({
      oauth2: ["mail:send"]
    });
    expect(openApi.paths["/api/v2/forward"].post.security).toContainEqual({
      oauth2: ["mail:send"]
    });
    expect(
      openApi.paths["/api/v2/messages/{id}/remote-media/trust"].post.security
    ).not.toContainEqual({ agentBearer: [] });
    expect(
      openApi.paths["/api/v2/messages/{id}/{action}"].post.parameters.find(
        (parameter) => parameter.name === "action"
      ).schema.enum
    ).toEqual(expect.arrayContaining(["restore", "unarchive"]));
    expect(
      openApi.paths["/api/v2/drafts/{id}/attachments"].post.requestBody.content[
        "multipart/form-data"
      ].encoding.file.contentType
    ).toBe("*/*");
    expect(openApi.paths["/api/v2/users"]).toBeUndefined();
    expect(JSON.stringify(openApi)).not.toContain("r2Key");
  });

  it("publishes the v1 mailbox schema without reviving alias storage", () => {
    expect(v1OpenApi.openapi).toBe("3.1.0");
    expect(v1OpenApi.info.version).toBe("1.0.0");
    expect(v1OpenApi.info.description).toBe(
      "Stable v1 mail API for HQBase clients, automations, and agents. Additive fields may be introduced within v1; clients must ignore unknown response fields. Administrative APIs are not part of this contract."
    );
    expect(Object.keys(v1OpenApi.paths).every((path) => path.startsWith("/api/v1/"))).toBe(true);
    expect(v1OpenApi.components.securitySchemes.agentBearer).toBeUndefined();
    expect(v1OpenApi.components.schemas.Mailbox.required).toEqual([
      "id",
      "address",
      "addresses",
      "displayName",
      "isActive",
      "accessLevel",
      "createdAt",
      "updatedAt"
    ]);
    expect(v1OpenApi.components.schemas.Mailbox.properties.kind).toBeUndefined();
    expect(v1OpenApi.components.schemas.Mailbox.properties.deletedAt).toBeUndefined();
    expect(v1OpenApi.components.schemas.Mailbox.properties.addresses).toMatchObject({
      minItems: 1,
      maxItems: 1,
      items: { $ref: "#/components/schemas/MailboxAddress" }
    });
    expect(v1OpenApi.components.schemas.MailboxAddress).toBeDefined();
    expect(
      v1OpenApi.paths["/api/v1/messages"].get.parameters.find(
        (parameter) => parameter.name === "folder"
      ).description
    ).toBe(
      "Message folder to list. The `drafts` value remains for v1 compatibility, but current write paths do not store drafts as message rows. Use `/api/v1/drafts` for drafts."
    );
    expect(JSON.stringify(v1OpenApi)).not.toContain("agentBearer");
    expect(JSON.stringify(v1OpenApi)).not.toContain("x-hqbase-agent-capabilities");
    expect(JSON.stringify(v1OpenApi)).not.toContain("r2Key");
  });

  it("generates human-testable OAuth setup and every OpenAPI operation", () => {
    const serialized = JSON.stringify(postman);
    expect(serialized).not.toContain("/api/v1");
    expect(serialized).toContain("/.well-known/oauth-protected-resource/api/v2");
    expect(serialized).toContain("/api/auth/oauth2/register");
    expect(serialized).toContain("hqb_agent_ credential");
    expect(serialized).toContain("{{ws_base_url}}/api/v2/events");
    expect(postman.variable).toContainEqual({
      key: "ws_base_url",
      value: "wss://mail.example.com",
      type: "string"
    });
    expect(
      postman.item
        .flatMap((folder) => folder.item)
        .some((item) => item.name.includes("Open change event WebSocket"))
    ).toBe(false);
    const oauthSetup = postman.item.find((folder) => folder.name === "OAuth setup");
    const registrationRequest = oauthSetup.item.find(
      (request) => request.name === "Register public client"
    );
    expect(JSON.parse(registrationRequest.request.body.raw).resources).toEqual([
      "{{api_resource}}"
    ]);
    for (const [route, pathItem] of Object.entries(openApi.paths)) {
      if (route === "/api/v2/events") continue;
      for (const operation of Object.values(pathItem)) {
        expect(serialized).toContain(operation.summary);
      }
    }
  });

  it("generates v1 OAuth and event setup for existing clients", () => {
    const serialized = JSON.stringify(v1Postman);
    expect(v1Postman.info.description).toContain("hqbase-mail-api-v1.openapi.json. Set base_url");
    expect(v1Postman.info.description).not.toContain("For a tool acting for a person");
    expect(serialized).not.toContain("/api/v2");
    expect(serialized).toContain("/.well-known/oauth-protected-resource/api/v1");
    expect(serialized).toContain("{{ws_base_url}}/api/v1/events");
    expect(serialized).not.toContain("hqb_agent_ credential");
    for (const [route, pathItem] of Object.entries(v1OpenApi.paths)) {
      if (route === "/api/v1/events") continue;
      for (const operation of Object.values(pathItem)) {
        expect(serialized).toContain(operation.summary);
      }
    }
  });
});
