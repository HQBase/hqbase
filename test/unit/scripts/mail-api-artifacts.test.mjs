import { readFile } from "node:fs/promises";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { describe, expect, it } from "vitest";
import { withSignatures } from "../../../scripts/mail-api-signatures.mjs";

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
    expect(
      openApi.paths["/api/v2/conversations"].get.parameters.find(
        (parameter) => parameter.name === "labelIds"
      )
    ).toMatchObject({
      explode: true,
      schema: { type: "array", uniqueItems: true },
      style: "form"
    });
    expect(openApi.components.securitySchemes.agentBearer).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "hqb_agent_<secret>"
    });
    expect(openApi.components.schemas.Mailbox.required).toContain("deletedAt");
    expect(openApi.components.schemas.Mailbox.properties.displayName.description).toContain(
      "sender name"
    );
    expect(openApi.components.schemas.MessageSummary.required).toContain("fromName");
    expect(openApi.components.schemas.MessageSummary.properties.fromName).toMatchObject({
      anyOf: expect.arrayContaining([{ type: "null" }])
    });
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
    expect(
      openApi.paths["/api/v2/drafts/{id}/attachments"].post.requestBody.content[
        "multipart/form-data"
      ].schema.properties.inline
    ).toMatchObject({ type: "boolean", default: false });
    expect(openApi.components.schemas.DraftAttachment.required).toContain("inline");
    expect(
      openApi.paths["/api/v2/drafts/{draftId}/attachments/{id}/inline"].get.security
    ).toContainEqual({ oauth2: ["mail:send"] });
    expect(
      openApi.paths["/api/v2/drafts/{draftId}/attachments/{id}/inline"].get.responses["415"]
    ).toBeDefined();
    expect(openApi.paths["/api/v2/users"]).toBeUndefined();
    expect(JSON.stringify(openApi)).not.toContain("r2Key");
  });

  it.each([
    [1, v1OpenApi],
    [2, openApi]
  ])("separates draft selections from saved snapshots in v%i", (version, document) => {
    const schemas = document.components.schemas;
    const validator = new AjvJsonSchemaValidator();
    const compile = (name) =>
      validator.getValidator({
        $ref: `#/components/schemas/${name}`,
        components: document.components
      });
    const draft = {
      id: "drf_deleted_signature",
      version: 3,
      updatedAt: "2026-09-04T10:00:00.000Z",
      mailboxId: null,
      replyToMessageId: null,
      forwardOfMessageId: null,
      from: "owner@example.test",
      to: ["a@example.test"],
      cc: [],
      bcc: [],
      subject: "Hello",
      text: "Body",
      html: "",
      attachments: [],
      labels: [],
      signature: {
        mode: "selected",
        id: null,
        name: "Saved name",
        html: "<p>Saved signature</p>",
        text: "Saved signature"
      }
    };
    expect(compile("Draft")(draft).valid).toBe(true);
    expect(compile("DraftInput")(draft).valid).toBe(false);
    for (const signature of [
      { mode: "automatic" },
      { mode: "selected", id: "sig_1" },
      { mode: "none" }
    ]) {
      expect(compile("DraftInput")({ ...draft, signature }).valid).toBe(true);
    }

    const signatures = (schema) => {
      if (schema.$ref) return signatures(schemas[schema.$ref.split("/").at(-1)]);
      return [
        ...(schema.properties?.signature ? [schema.properties.signature] : []),
        ...(schema.allOf ?? []).flatMap(signatures)
      ];
    };
    expect(signatures(schemas.DraftInput)).toEqual([
      { $ref: "#/components/schemas/SignatureSelection" }
    ]);
    expect(signatures(schemas.Draft)).toEqual([{ $ref: "#/components/schemas/SignatureSnapshot" }]);
    expect(schemas.SignatureSnapshot.properties.id.anyOf).toContainEqual({ type: "null" });
    expect(schemas.SignatureSnapshot.properties.mode.enum).toContain("selected");
    expect(
      schemas.SignatureSelection.oneOf.find((schema) => schema.properties.mode.const === "selected")
        .properties.id
    ).toMatchObject({ type: "string", minLength: 1 });
    expect(schemas.Draft.allOf[1].required).toContain("labels");
    expect(withSignatures(withSignatures(document, version), version)).toEqual(
      withSignatures(document, version)
    );
    const serialized = JSON.stringify(document);
    expect(serialized).not.toContain('"type":["string","null"]');
  });

  it.each([
    [1, v1OpenApi],
    [2, openApi]
  ])("publishes human-only signature management in v%i", (version, document) => {
    for (const [path, method] of [
      ["/signatures/manage", "get"],
      ["/signatures", "post"],
      ["/signatures/{id}", "patch"],
      ["/signatures/{id}", "delete"]
    ]) {
      const operation = document.paths[`/api/v${version}${path}`][method];
      expect(operation.security).toEqual([
        { oauth2: ["signatures:manage"] },
        { cookieSession: [] }
      ]);
      expect(operation["x-hqbase-agent-capabilities"]).toBeUndefined();
    }
    expect(document.paths[`/api/v${version}/signatures`].get.security).toContainEqual({
      oauth2: ["mail:send"]
    });
  });

  it("documents optional v1 label membership and keeps v2 membership required", () => {
    for (const path of [
      "/messages",
      "/messages/{id}",
      "/messages/{id}/thread",
      "/conversations",
      "/changes"
    ]) {
      expect(v1OpenApi.paths[`/api/v1${path}`].get.parameters).toContainEqual(
        expect.objectContaining({
          name: "includeLabels",
          schema: { type: "boolean", default: false }
        })
      );
    }
    expect(v1OpenApi.components.schemas.MessageSummary.properties.labels).toBeDefined();
    expect(v1OpenApi.components.schemas.MessageSummary.required).not.toContain("labels");
    expect(openApi.components.schemas.MessageSummary.required).toContain("labels");
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
    expect(v1OpenApi.components.schemas.Mailbox.properties.displayName.description).toContain(
      "sender name"
    );
    expect(v1OpenApi.components.schemas.MessageSummary.required).toContain("fromName");
    expect(v1OpenApi.components.schemas.DraftAttachment.required).toContain("inline");
    expect(
      v1OpenApi.paths["/api/v1/drafts/{draftId}/attachments/{id}/inline"].get.security
    ).toContainEqual({ oauth2: ["mail:send"] });
    expect(
      v1OpenApi.paths["/api/v1/messages"].get.parameters.find(
        (parameter) => parameter.name === "folder"
      ).description
    ).toBe(
      "Message folder to list. The `drafts` value remains for v1 compatibility, but current write paths do not store drafts as message rows. Use `/api/v1/drafts` for drafts."
    );
    expect(
      v1OpenApi.paths["/api/v1/messages"].get.parameters.find(
        (parameter) => parameter.name === "labelIds"
      )?.schema.type
    ).toBe("array");
    expect(
      v1OpenApi.paths["/api/v1/messages"].get.parameters.find(
        (parameter) => parameter.name === "labelId"
      )?.schema.type
    ).toBe("string");
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
    const addDraftAttachment = postman.item
      .flatMap((folder) => folder.item)
      .find((item) => item.name === "Add a draft attachment");
    expect(addDraftAttachment.request.body.formdata).toContainEqual(
      expect.objectContaining({ key: "inline", value: "true", disabled: true })
    );
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
