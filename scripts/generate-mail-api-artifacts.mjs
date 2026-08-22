import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = "api";
const openApiLocation = path.join(outputDirectory, "hqbase-mail-api-v1.openapi.json");
const openApiDocument = JSON.parse(await readFile(openApiLocation, "utf8"));
validateOpenApi(openApiDocument);
const outputs = {
  "hqbase-mail-api-v1.postman_collection.json": buildCollection(openApiDocument),
  "hqbase-mail-api-v1.postman_environment.json": buildEnvironment()
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
  for (const [name, expected] of Object.entries(serialized)) {
    const location = path.join(outputDirectory, name);
    const actual = await readFile(location, "utf8").catch(() => null);
    if (actual !== expected) drift.push(location);
  }
  if (drift.length > 0) {
    throw new Error(
      `Generated Mail API artifacts are stale:\n${drift.join("\n")}\nRun pnpm api:generate.`
    );
  }
  console.log("Verified generated HQBase Mail API artifacts.");
}

function buildCollection(document) {
  const folders = new Map();
  for (const [route, pathItem] of Object.entries(document.paths)) {
    for (const method of ["get", "post", "patch", "delete"]) {
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
      _postman_id: "62c6dbf4-835d-4a3f-87df-77b7ddcf2db1",
      name: "HQBase Mail API v1",
      description:
        "Generated from api/hqbase-mail-api-v1.openapi.json. Set base_url, run Register public client, and use Postman's OAuth 2.0 Authorization Code flow with PKCE (S256). Auth URL: {{base_url}}/api/auth/oauth2/authorize. Token URL: {{base_url}}/api/auth/oauth2/token. Client ID: {{client_id}}. Scope: mail:read mail:write mail:send offline_access. Add authorization request parameter resource={{api_resource}}, then store the resulting token only in your local environment as access_token. Sending, replying, and forwarding are not idempotent.",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
    },
    auth: {
      type: "bearer",
      bearer: [{ key: "token", value: "{{access_token}}", type: "string" }]
    },
    variable: [
      { key: "base_url", value: "https://mail.example.com", type: "string" },
      { key: "api_resource", value: "{{base_url}}/api/v1", type: "string" },
      { key: "client_id", value: "", type: "string" },
      { key: "access_token", value: "", type: "string" },
      { key: "id", value: "msg_example", type: "string" },
      { key: "attachmentId", value: "att_example", type: "string" },
      { key: "draftId", value: "drf_example", type: "string" },
      { key: "action", value: "read", type: "string" }
    ],
    item: [oauthSetupFolder(), ...folders.values()]
  };
}

function validateOpenApi(document) {
  if (document.openapi !== "3.1.0" || document.info?.version !== "1.0.0") {
    throw new Error("The Mail API contract must remain an OpenAPI 3.1 v1 document.");
  }
  const requiredPaths = [
    "/api/v1/mailboxes",
    "/api/v1/messages",
    "/api/v1/changes",
    "/api/v1/conversations",
    "/api/v1/drafts",
    "/api/v1/send",
    "/api/v1/reply",
    "/api/v1/forward"
  ];
  for (const route of requiredPaths) {
    if (!document.paths?.[route]) throw new Error(`Mail API contract is missing ${route}.`);
  }
  if (JSON.stringify(document).includes("r2Key")) {
    throw new Error("The public Mail API contract must not expose internal storage keys.");
  }
}

function oauthSetupFolder() {
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
        "{{base_url}}/.well-known/oauth-protected-resource/api/v1"
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
      value: parameter.name === "folder" ? "inbox" : "",
      disabled: parameter.name !== "folder",
      description: parameter.description
    }));
  const request = {
    method: method.toUpperCase(),
    header: [],
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

function buildEnvironment() {
  return {
    id: "0757b49e-e97e-4ef6-bef1-e3b5f06ac106",
    name: "HQBase Mail API v1 - local secrets",
    values: [
      { key: "base_url", value: "https://mail.example.com", enabled: true, type: "default" },
      { key: "api_resource", value: "{{base_url}}/api/v1", enabled: true, type: "default" },
      { key: "client_id", value: "", enabled: true, type: "default" },
      { key: "access_token", value: "", enabled: true, type: "secret" }
    ],
    _postman_variable_scope: "environment",
    _postman_exported_at: "2026-08-15T00:00:00.000Z",
    _postman_exported_using: "HQBase generator"
  };
}
