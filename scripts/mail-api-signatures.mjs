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

  for (const name of ["DraftInput", "SendInput", "ReplyInput", "ForwardInput"]) {
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
  return result;
}

function signatureSchemas() {
  const mode = (value) => ({
    type: "object",
    required: ["mode"],
    properties: { mode: { type: "string", const: value } }
  });
  return {
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
        id: { type: ["string", "null"] },
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
        automaticSignatureId: { type: ["string", "null"] },
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
