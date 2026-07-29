import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { AppError, toAppError } from "../../lib/errors";
import type { StoredAttachment } from "../messages/types";

export const maxMcpAttachmentBytes = 10 * 1024 * 1024;
export const maxMcpAttachmentBase64Length = Math.ceil(maxMcpAttachmentBytes / 3) * 4;

export async function toolResult(run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const value = await run();
    return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
  } catch (error) {
    return toolError(error);
  }
}

export async function attachmentResult(
  run: () => Promise<{ attachment: StoredAttachment; object: R2ObjectBody }>
): Promise<CallToolResult> {
  try {
    const { attachment, object } = await run();
    if (attachment.sizeBytes > maxMcpAttachmentBytes || object.size > maxMcpAttachmentBytes) {
      throw new AppError(
        "MCP_ATTACHMENT_TOO_LARGE",
        "MCP attachment transfers are limited to 10 MiB.",
        413
      );
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              id: attachment.id,
              filename: attachment.filename,
              contentType: attachment.contentType,
              sizeBytes: attachment.sizeBytes
            },
            null,
            2
          )
        },
        {
          type: "resource",
          resource: {
            uri: `hqbase://attachments/${attachment.id}/${encodeURIComponent(attachment.filename)}`,
            mimeType: attachment.contentType,
            blob: bytesToBase64(new Uint8Array(await object.arrayBuffer()))
          }
        }
      ]
    };
  } catch (error) {
    return toolError(error);
  }
}

export function base64File(input: {
  contentBase64: string;
  contentType: string;
  filename: string;
}): File {
  let binary: string;
  try {
    binary = atob(input.contentBase64);
  } catch {
    throw new AppError("ATTACHMENT_INVALID_BASE64", "Attachment content is not valid base64.", 400);
  }
  if (binary.length > maxMcpAttachmentBytes) {
    throw new AppError(
      "MCP_ATTACHMENT_TOO_LARGE",
      "MCP attachment transfers are limited to 10 MiB.",
      413
    );
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], input.filename, { type: input.contentType });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function toolError(error: unknown): CallToolResult {
  const appError = toAppError(error);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: { code: appError.code, message: appError.message } })
      }
    ],
    isError: true
  };
}
