import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { assertPatArtifactSecretSafe } from "../../helpers/pat-artifact-safety";

const openApi = JSON.parse(await readFile("api/hqbase-mail-api-v1.openapi.json", "utf8"));
const postman = JSON.parse(
  await readFile("api/hqbase-mail-api-v1.postman_collection.json", "utf8")
);
const postmanEnvironment = JSON.parse(
  await readFile("api/hqbase-mail-api-v1.postman_environment.json", "utf8")
);

const expectedOauthScopes = {
  "/api/v1/mailboxes": { get: ["mail:read"] },
  "/api/v1/changes": { get: ["mail:read"] },
  "/api/v1/messages": { get: ["mail:read"] },
  "/api/v1/messages/{id}": { get: ["mail:read"] },
  "/api/v1/messages/{id}/thread": { get: ["mail:read"] },
  "/api/v1/messages/{id}/html": { get: ["mail:read"] },
  "/api/v1/messages/{id}/inline/{attachmentId}": { get: ["mail:read"] },
  "/api/v1/attachments/{id}": { get: ["mail:read"] },
  "/api/v1/messages/{id}/remote-media/trust": { post: ["mail:write"] },
  "/api/v1/messages/{id}/{action}": { post: ["mail:write"] },
  "/api/v1/conversations": { get: ["mail:read"] },
  "/api/v1/conversations/{id}/{action}": { post: ["mail:write"] },
  "/api/v1/drafts": { get: ["mail:send"], post: ["mail:send"] },
  "/api/v1/drafts/{id}": {
    get: ["mail:send"],
    patch: ["mail:send"],
    delete: ["mail:send"]
  },
  "/api/v1/drafts/{id}/attachments": { post: ["mail:send"] },
  "/api/v1/drafts/{draftId}/attachments/{id}": { delete: ["mail:send"] },
  "/api/v1/send": { post: ["mail:send"] },
  "/api/v1/reply": { post: ["mail:send"] },
  "/api/v1/forward": { post: ["mail:send"] }
};

describe("Mail API public artifacts", () => {
  it("publishes the versioned endpoint and scope matrix without internal storage keys", () => {
    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.paths["/api/v1/messages"].get.security).toContainEqual({
      oauth2: ["mail:read"]
    });
    expect(openApi.paths["/api/v1/changes"].get.security).toContainEqual({
      oauth2: ["mail:read"]
    });
    expect(openApi.components.schemas.MessageChangePage.required).toEqual([
      "changes",
      "nextCursor",
      "hasMore"
    ]);
    expect(openApi.paths["/api/v1/messages/{id}/{action}"].post.security).toContainEqual({
      oauth2: ["mail:write"]
    });
    expect(openApi.paths["/api/v1/send"].post.security).toContainEqual({
      oauth2: ["mail:send"]
    });
    expect(openApi.paths["/api/v1/forward"].post.security).toContainEqual({
      oauth2: ["mail:send"]
    });
    expect(
      openApi.paths["/api/v1/messages/{id}/{action}"].post.parameters.find(
        (parameter) => parameter.name === "action"
      ).schema.enum
    ).toEqual(expect.arrayContaining(["restore", "unarchive"]));
    expect(
      openApi.paths["/api/v1/drafts/{id}/attachments"].post.requestBody.content[
        "multipart/form-data"
      ].encoding.file.contentType
    ).toBe("*/*");
    expect(openApi.paths["/api/v1/users"]).toBeUndefined();
    expect(JSON.stringify(openApi)).not.toContain("r2Key");
  });

  it("adds PAT authentication without changing any OAuth or cookie requirement", () => {
    for (const [path, methods] of Object.entries(expectedOauthScopes)) {
      for (const [method, scopes] of Object.entries(methods)) {
        const operation = openApi.paths[path][method];
        expect(operation.security).toEqual([
          { oauth2: scopes },
          { cookieSession: [] },
          { personalAccessToken: [] }
        ]);
        expect(operation.responses["401"]).toEqual({
          $ref: "#/components/responses/MailApiUnauthorized"
        });
      }
    }
    for (const [path, pathItem] of Object.entries(openApi.paths)) {
      for (const method of ["get", "post", "patch", "delete"]) {
        const operation = pathItem[method];
        if (!operation) continue;
        expect(operation.security, `${method.toUpperCase()} ${path}`).toContainEqual({
          personalAccessToken: []
        });
        expect(operation.responses["401"], `${method.toUpperCase()} ${path}`).toEqual({
          $ref: "#/components/responses/MailApiUnauthorized"
        });
      }
    }
    expect(openApi.components.securitySchemes.personalAccessToken).toEqual({
      type: "http",
      scheme: "bearer",
      bearerFormat: "HQBase PAT",
      description:
        "An HQBase personal access token. PATs can call every Mail API operation, subject to the token owner's current role and mailbox grants."
    });
  });

  it("documents stable Mail API authentication errors and dispatch", () => {
    const unauthorized = openApi.components.responses.MailApiUnauthorized;
    expect(unauthorized.description).toContain(
      "UNAUTHENTICATED with the message A session cookie or bearer token is required."
    );
    expect(unauthorized.description).toContain(
      "INVALID_OAUTH_TOKEN, and a rejected PAT returns INVALID_PERSONAL_ACCESS_TOKEN"
    );
    expect(unauthorized.description).toContain("Bearer token is invalid or inactive.");
    expect(unauthorized.description).toContain("start with hqb_pat_");
    expect(unauthorized.description).toContain("does not fall back to a session cookie");
  });

  it("generates human-testable OAuth setup and every OpenAPI operation", () => {
    const serialized = JSON.stringify(postman);
    expect(serialized).toContain("/.well-known/oauth-protected-resource/api/v1");
    expect(serialized).toContain("/api/auth/oauth2/register");
    const oauthSetup = postman.item.find((folder) => folder.name === "OAuth setup");
    const registrationRequest = oauthSetup.item.find(
      (request) => request.name === "Register public client"
    );
    expect(JSON.parse(registrationRequest.request.body.raw).resources).toEqual([
      "{{api_resource}}"
    ]);
    for (const pathItem of Object.values(openApi.paths)) {
      for (const operation of Object.values(pathItem)) {
        expect(serialized).toContain(operation.summary);
      }
    }
  });

  it("keeps checked-in API artifacts free of PATs, hashes, and populated access tokens", () => {
    assertPatArtifactSecretSafe(openApi);
    assertPatArtifactSecretSafe(postman);
    assertPatArtifactSecretSafe(postmanEnvironment);

    const collectionAccessToken = postman.variable.find(
      (variable) => variable.key === "access_token"
    );
    const environmentAccessToken = postmanEnvironment.values.find(
      (variable) => variable.key === "access_token"
    );
    expect(collectionAccessToken).toMatchObject({
      key: "access_token",
      value: "",
      type: "string"
    });
    expect(environmentAccessToken).toMatchObject({
      key: "access_token",
      value: "",
      type: "secret"
    });
  });

  it.each([
    ["complete PAT", { example: `hqb_pat_${"A".repeat(43)}` }],
    ["token hash", { token_hash: "synthetic-hash" }],
    ["populated access token", { key: "access_token", value: "synthetic-access-token" }]
  ])("rejects synthetic artifact credential material: %s", (_label, value) => {
    expect(() => assertPatArtifactSecretSafe(value)).toThrow(
      "PAT artifact contains sensitive credential material."
    );
  });
});
