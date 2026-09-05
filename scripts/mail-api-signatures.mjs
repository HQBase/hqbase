export function withSignatures(document, version) {
  const result = structuredClone(document);
  const apiBasePath = `/api/v${version}`;
  if (!(result.tags ?? []).some((tag) => tag.name === "Signatures")) {
    result.tags ??= [];
    result.tags.push({ name: "Signatures" });
  }
  result.components ??= {};
  result.components.schemas ??= {};
  Object.assign(result.components.schemas, signatureSchemas());

  const schemas = result.components.schemas;
  const fields = structuredClone(schemas.DraftFields ?? schemas.DraftInput);
  delete fields.properties.signature;
  schemas.DraftFields = fields;
  schemas.DraftInput = {
    allOf: [
      { $ref: "#/components/schemas/DraftFields" },
      {
        type: "object",
        properties: { signature: { $ref: "#/components/schemas/SignatureSelection" } }
      }
    ]
  };
  schemas.Draft.allOf[0] = { $ref: "#/components/schemas/DraftFields" };
  for (const name of ["SendInput", "ReplyInput", "ForwardInput"]) {
    result.components.schemas[name].properties.signature = {
      $ref: "#/components/schemas/SignatureSelection"
    };
  }
  const draftOutput = result.components.schemas.Draft.allOf[1];
  draftOutput.required = [...new Set([...draftOutput.required, "signature"])];
  draftOutput.properties.signature = { $ref: "#/components/schemas/SignatureSnapshot" };

  result.paths[`${apiBasePath}/signatures`] = {
    get: {
      summary: "List signatures for a From address",
      security: [{ oauth2: ["mail:send"] }, { cookieSession: [] }],
      responses: {
        200: {
          description: "Applicable signatures and the automatic selection",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/SignatureCandidates" }
            }
          }
        },
        400: errorResponse("Invalid From address"),
        401: errorResponse("Missing or invalid authentication"),
        403: errorResponse("Insufficient OAuth scope or mailbox access"),
        404: errorResponse("Sending mailbox not found")
      },
      tags: ["Signatures"],
      operationId: "listSignatures",
      description:
        "Returns only personal, mailbox, and exact-domain signatures usable from the exact address.",
      parameters: [
        {
          name: "from",
          in: "query",
          required: true,
          description: "Exact sending address.",
          schema: { type: "string", format: "email", maxLength: 254 }
        }
      ]
    }
  };
  const managementSecurity = [{ oauth2: ["signatures:manage"] }, { cookieSession: [] }];
  result.components.securitySchemes.oauth2.flows.authorizationCode.scopes["signatures:manage"] =
    "Manage signatures within the person's current access";
  const managementOperation = (summary, operationId, schema, status = 200) => ({
    summary,
    operationId,
    tags: ["Signatures"],
    security: managementSecurity,
    responses: {
      [status]: {
        description: summary,
        ...(schema ? { content: { "application/json": { schema } } } : {})
      },
      400: errorResponse("Invalid signature"),
      401: errorResponse("Missing or invalid authentication"),
      403: errorResponse("Insufficient scope or signature management access"),
      404: errorResponse("Signature or target not found"),
      409: errorResponse("Signature name already exists in this scope")
    }
  });
  result.paths[`${apiBasePath}/signatures/manage`] = {
    get: managementOperation("List manageable signatures", "listManageableSignatures", {
      type: "array",
      items: { $ref: "#/components/schemas/Signature" }
    })
  };
  result.paths[`${apiBasePath}/signatures`].post = {
    ...managementOperation(
      "Create a signature",
      "createSignature",
      { $ref: "#/components/schemas/Signature" },
      201
    ),
    requestBody: {
      required: true,
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/CreateSignatureInput" } }
      }
    }
  };
  const idParameter = { name: "id", in: "path", required: true, schema: { type: "string" } };
  result.paths[`${apiBasePath}/signatures/{id}`] = {
    patch: {
      ...managementOperation("Update a signature", "updateSignature", {
        $ref: "#/components/schemas/Signature"
      }),
      parameters: [idParameter],
      requestBody: {
        required: true,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/UpdateSignatureInput" } }
        }
      }
    },
    delete: {
      ...managementOperation("Delete a signature", "deleteSignature", null, 204),
      parameters: [idParameter]
    }
  };
  return result;
}

function signatureSchemas() {
  const mode = (value) => ({
    type: "object",
    required: ["mode"],
    properties: { mode: { type: "string", const: value } }
  });
  return {
    CreateSignatureInput: {
      type: "object",
      required: ["name", "html", "scope"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 200 },
        html: { type: "string", maxLength: 400000 },
        scope: {
          type: "object",
          required: ["type", "id"],
          properties: {
            type: { type: "string", enum: ["user", "mailbox", "domain"] },
            id: { type: "string", minLength: 1, maxLength: 100 }
          }
        },
        isDefault: { type: "boolean", default: false }
      }
    },
    UpdateSignatureInput: {
      type: "object",
      anyOf: [{ required: ["name"] }, { required: ["html"] }, { required: ["isDefault"] }],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 200 },
        html: { type: "string", maxLength: 400000 },
        isDefault: { type: "boolean" }
      }
    },
    SignatureSelection: {
      oneOf: [
        mode("automatic"),
        {
          type: "object",
          required: ["mode", "id"],
          properties: {
            mode: { type: "string", const: "selected" },
            id: { type: "string", minLength: 1, maxLength: 100 }
          }
        },
        mode("none")
      ]
    },
    SignatureSnapshot: {
      type: "object",
      required: ["mode", "id", "name", "html", "text"],
      properties: {
        mode: { type: "string", enum: ["automatic", "selected", "none"] },
        id: {
          anyOf: [{ type: "string" }, { type: "null" }],
          description:
            "Null when no signature was selected or the selected signature was deleted. Saved snapshot content remains available."
        },
        name: { type: "string" },
        html: { type: "string" },
        text: { type: "string" }
      }
    },
    Signature: {
      type: "object",
      required: [
        "id",
        "name",
        "html",
        "text",
        "scope",
        "scopeId",
        "scopeLabel",
        "isDefault",
        "createdAt",
        "updatedAt"
      ],
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        html: { type: "string" },
        text: { type: "string" },
        scope: { type: "string", enum: ["user", "mailbox", "domain"] },
        scopeId: { type: "string" },
        scopeLabel: { type: "string" },
        isDefault: { type: "boolean" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" }
      }
    },
    SignatureCandidates: {
      type: "object",
      required: ["automaticSignatureId", "signatures"],
      properties: {
        automaticSignatureId: { anyOf: [{ type: "string" }, { type: "null" }] },
        signatures: {
          type: "array",
          items: { $ref: "#/components/schemas/Signature" }
        }
      }
    }
  };
}

function errorResponse(description) {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
  };
}
