import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { withSignatures } from "./mail-api-signatures.mjs";

const outputDirectory = "api";
const v1OpenApiLocation = path.join(outputDirectory, "hqbase-mail-api-v1.openapi.json");
const v2OpenApiLocation = path.join(outputDirectory, "hqbase-mail-api-v2.openapi.json");
const v1OpenApiDocument = withSignatures(JSON.parse(await readFile(v1OpenApiLocation, "utf8")), 1);
const v2OpenApiDocument = withAgentAuthentication(
  withSignatures(JSON.parse(await readFile(v2OpenApiLocation, "utf8")), 2)
);
validateOpenApi(v1OpenApiDocument, 1);
validateOpenApi(v2OpenApiDocument, 2);
const outputs = {
  "hqbase-mail-api-v1.openapi.json": v1OpenApiDocument,
  "hqbase-mail-api-v1.postman_collection.json": buildCollection(v1OpenApiDocument, 1),
  "hqbase-mail-api-v1.postman_environment.json": buildEnvironment(1),
  "hqbase-mail-api-v2.openapi.json": v2OpenApiDocument,
  "hqbase-mail-api-v2.postman_collection.json": buildCollection(v2OpenApiDocument, 2),
  "hqbase-mail-api-v2.postman_environment.json": buildEnvironment(2)
};
const serialized = Object.fromEntries(
  Object.entries(outputs).map(([name, value]) => [name, `${JSON.stringify(value, null, 2)}\n`])
);

if (process.argv.includes("--write")) {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    Object.entries(serialized).map(([name, contents]) =>
      writeFile(path.join(outputDirectory, name), contents)
    )
  );
  console.log("Generated HQBase Mail API OpenAPI and Postman artifacts.");
} else {
  const drift = [];
  for (const [name, expected] of Object.entries(outputs)) {
    const location = path.join(outputDirectory, name);
    const actual = await readFile(location, "utf8")
      .then((contents) => JSON.parse(contents))
      .catch(() => null);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) drift.push(location);
  }
  if (drift.length > 0) {
    throw new Error(
      `Generated Mail API artifacts are stale:\n${drift.join("\n")}\nRun pnpm api:generate.`
    );
  }
  console.log("Verified generated HQBase Mail API artifacts.");
}

function buildCollection(document, version) {
  const apiBasePath = `/api/v${version}`;
  const folders = new Map();
  for (const [route, pathItem] of Object.entries(document.paths)) {
    // Postman v2.1 HTTP collections cannot contain a real WebSocket request.
    // Keep the socket in OpenAPI and provide manual connection details below.
    if (route === `${apiBasePath}/events`) continue;
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = pathItem[method];
      if (!operation) continue;
      const tag = operation.tags?.[0] ?? "Mail API";
      const folder = folders.get(tag) ?? { name: tag, item: [] };
      folder.item.push(postmanRequest(route, method, operation));
      folders.set(tag, folder);
    }
  }

  return {
    info: {
      _postman_id:
        version === 1
          ? "62c6dbf4-835d-4a3f-87df-77b7ddcf2db1"
          : "72c6dbf4-835d-4a3f-87df-77b7ddcf2db2",
      name: `HQBase Mail API v${version}`,
      description: `Generated from api/hqbase-mail-api-v${version}.openapi.json. ${version === 2 ? "For a tool acting for a person, set" : "Set"} base_url, run Register public client, and use Postman's OAuth 2.0 Authorization Code flow with PKCE (S256). Auth URL: {{base_url}}/api/auth/oauth2/authorize. Token URL: {{base_url}}/api/auth/oauth2/token. Client ID: {{client_id}}. Scope: mail:read mail:write mail:send offline_access. Add authorization request parameter resource={{api_resource}}, then store the resulting token only in your local environment as access_token.${version === 2 ? " For a mailbox agent, skip OAuth and set access_token to its one-time hqb_agent_ credential." : ""} Postman v2.1 HTTP collections cannot contain WebSocket requests. To receive change wakes, create a separate WebSocket request to {{ws_base_url}}${apiBasePath}/events and add Authorization: Bearer {{access_token}}. Sending, replying, and forwarding are not idempotent.`,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    auth: {
      type: "bearer",
      bearer: [{ key: "token", value: "{{access_token}}", type: "string" }]
    },
    variable: [
      { key: "base_url", value: "https://mail.example.com", type: "string" },
      { key: "ws_base_url", value: "wss://mail.example.com", type: "string" },
      { key: "api_resource", value: `{{base_url}}${apiBasePath}`, type: "string" },
      { key: "client_id", value: "", type: "string" },
      { key: "access_token", value: "", type: "string" },
      { key: "id", value: "msg_example", type: "string" },
      { key: "attachmentId", value: "att_example", type: "string" },
      { key: "draftId", value: "drf_example", type: "string" },
      { key: "labelId", value: "lbl_example", type: "string" },
      { key: "signatureId", value: "sig_example", type: "string" },
      { key: "action", value: "read", type: "string" }
    ],
    item: [oauthSetupFolder(version), ...folders.values()]
  };
}

function withAgentAuthentication(document) {
  const result = structuredClone(document);
  result.components ??= {};
  result.components.securitySchemes ??= {};
  result.components.securitySchemes.agentBearer = {
    type: "http",
    scheme: "bearer",
    bearerFormat: "hqb_agent_<secret>",
    description:
      "Mailbox agent credential created in Settings > Agents. It works only for the assigned Mail API capabilities and mailbox grant. Each operation lists required capabilities in x-hqbase-agent-capabilities."
  };

  for (const [route, pathItem] of Object.entries(result.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      const operation = pathItem[method];
      if (!operation) continue;
      operation.security = (operation.security ?? []).filter(
        (requirement) => !("agentBearer" in requirement)
      );
      delete operation["x-hqbase-agent-capabilities"];
      if (route === "/api/v2/messages/{id}/remote-media/trust") continue;
      const capabilities = operation.security.find((requirement) => requirement.oauth2)?.oauth2;
      if (!capabilities) continue;
      operation.security.push({ agentBearer: [] });
      operation["x-hqbase-agent-capabilities"] = [...capabilities];
    }
  }

  return result;
}

function validateOpenApi(document, version) {
  if (document.openapi !== "3.1.0" || document.info?.version !== `${version}.0.0`) {
    throw new Error(`The Mail API v${version} contract must remain OpenAPI 3.1.`);
  }
  const apiBasePath = `/api/v${version}`;
  const requiredPaths = [
    `${apiBasePath}/mailboxes`,
    `${apiBasePath}/messages`,
    `${apiBasePath}/changes`,
    `${apiBasePath}/events`,
    `${apiBasePath}/conversations`,
    `${apiBasePath}/labels`,
    `${apiBasePath}/messages/{id}/labels/{labelId}`,
    `${apiBasePath}/conversations/{id}/labels/{labelId}`,
    `${apiBasePath}/drafts`,
    `${apiBasePath}/drafts/changes`,
    `${apiBasePath}/signatures`,
    `${apiBasePath}/send`,
    `${apiBasePath}/reply`,
    `${apiBasePath}/forward`
  ];
  for (const route of requiredPaths) {
    if (!document.paths?.[route]) throw new Error(`Mail API contract is missing ${route}.`);
  }
  if (JSON.stringify(document).includes("r2Key")) {
    throw new Error("The public Mail API contract must not expose internal storage keys.");
  }
}

function oauthSetupFolder(version) {
  return {
    name: "OAuth setup",
    item: [
      simpleRequest(
        "Authorization server metadata",
        "GET",
        "{{base_url}}/.well-known/oauth-authorization-server/api/auth"
      ),
      simpleRequest(
        "Mail API protected-resource metadata",
        "GET",
        `{{base_url}}/.well-known/oauth-protected-resource/api/v${version}`
      ),
      {
        name: "Register public client",
        event: [
          {
            listen: "test",
            script: {
              type: "text/javascript",
              exec: [
                "const registration = pm.response.json();",
                "if (registration.client_id) pm.environment.set('client_id', registration.client_id);"
              ]
            }
          }
        ],
        request: {
          auth: { type: "noauth" },
          method: "POST",
          header: [{ key: "Content-Type", value: "application/json" }],
          body: {
            mode: "raw",
            raw: JSON.stringify(
              {
                client_name: "HQBase Postman",
                redirect_uris: ["https://oauth.pstmn.io/v1/browser-callback"],
                token_endpoint_auth_method: "none",
                grant_types: ["authorization_code", "refresh_token"],
                response_types: ["code"],
                scope: "mail:read mail:write mail:send offline_access",
                resources: ["{{api_resource}}"]
              },
              null,
              2
            ),
            options: { raw: { language: "json" } }
          },
          url: { raw: "{{base_url}}/api/auth/oauth2/register" },
          description:
            "Creates a public PKCE client. The test script stores client_id in the active local environment."
        },
        response: []
      }
    ]
  };
}

function simpleRequest(name, method, raw) {
  return {
    name,
    request: { auth: { type: "noauth" }, method, header: [], url: { raw } },
    response: []
  };
}

function postmanRequest(route, method, operation) {
  const variables = [...route.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1]);
  const postmanRoute = route.replaceAll(/\{([^}]+)\}/gu, ":$1");
  const query = (operation.parameters ?? [])
    .filter((parameter) => parameter.in === "query")
    .map((parameter) => ({
      key: parameter.name,
      value:
        parameter.name === "folder"
          ? "inbox"
          : parameter.name === "from"
            ? "support@example.com"
            : "",
      disabled: parameter.required !== true && parameter.name !== "folder",
      description: parameter.description
    }));
  const headers = (operation.parameters ?? [])
    .filter((parameter) => parameter.in === "header")
    .map((parameter) => ({
      key: parameter.name,
      value: parameter.schema?.const ?? "",
      disabled: parameter.required !== true,
      description: parameter.description
    }));
  const request = {
    method: method.toUpperCase(),
    header: headers,
    url: {
      raw: `{{base_url}}${postmanRoute}`,
      variable: variables.map((name) => ({ key: name, value: `{{${name}}}` })),
      ...(query.length > 0 ? { query } : {})
    },
    description: operation.description ?? operation.summary
  };
  const content = operation.requestBody?.content ?? {};
  if (content["application/json"]) {
    request.header.push({ key: "Content-Type", value: "application/json" });
    request.body = {
      mode: "raw",
      raw: JSON.stringify(content["application/json"].example ?? {}, null, 2),
      options: { raw: { language: "json" } }
    };
  } else if (content["multipart/form-data"]) {
    request.body = {
      mode: "formdata",
      formdata: [{ key: "file", type: "file", src: [] }]
    };
  }
  return { name: operation.summary, request, response: [] };
}

function buildEnvironment(version) {
  return {
    id:
      version === 1
        ? "0757b49e-e97e-4ef6-bef1-e3b5f06ac106"
        : "1757b49e-e97e-4ef6-bef1-e3b5f06ac107",
    name: `HQBase Mail API v${version} - local secrets`,
    values: [
      { key: "base_url", value: "https://mail.example.com", enabled: true, type: "default" },
      { key: "ws_base_url", value: "wss://mail.example.com", enabled: true, type: "default" },
      {
        key: "api_resource",
        value: `{{base_url}}/api/v${version}`,
        enabled: true,
        type: "default"
      },
      { key: "client_id", value: "", enabled: true, type: "default" },
      { key: "access_token", value: "", enabled: true, type: "secret" }
    ],
    _postman_variable_scope: "environment",
    _postman_exported_at: "2026-08-15T00:00:00.000Z",
    _postman_exported_using: "HQBase generator"
  };
}
