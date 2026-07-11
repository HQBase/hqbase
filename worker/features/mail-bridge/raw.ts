import type { WorkerEnv } from "../../lib/env";
import { AppError } from "../../lib/errors";

type RawMessageRow = {
  id: string;
  raw_r2_key: string | null;
  from_address: string;
  to_json: string;
  subject: string;
  text_body: string;
  message_id: string | null;
};

function fallbackRaw(message: RawMessageRow): Uint8Array {
  const recipients = (JSON.parse(message.to_json) as string[]).join(", ");
  return new TextEncoder().encode(
    `From: ${message.from_address}\r\nTo: ${recipients}\r\nSubject: ${message.subject}\r\n` +
      `Message-ID: ${message.message_id ?? `<${message.id}@hqbase.local>`}\r\n\r\n` +
      `${message.text_body}\r\n`
  );
}

export async function rawMessageResponse(
  env: WorkerEnv,
  userId: string,
  mailboxId: string,
  uid: number,
  range: string | null
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT m.id, m.raw_r2_key, m.from_address, m.to_json, m.subject, m.text_body, m.message_id
     FROM pro_imap_messages im
     JOIN pro_imap_mailboxes mb ON mb.id = im.mailbox_id
     JOIN messages m ON m.id = im.message_id
     WHERE mb.user_id = ? AND mb.id = ? AND im.uid = ?`
  )
    .bind(userId, mailboxId, uid)
    .first<RawMessageRow>();
  if (!row) throw new AppError("MESSAGE_NOT_FOUND", "IMAP message not found.", 404);
  if (!row.raw_r2_key) {
    if (range)
      throw new AppError("RANGE_UNSUPPORTED", "Range is unavailable for generated MIME.", 416);
    const raw = fallbackRaw(row);
    const body = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    return new Response(body, { headers: { "content-type": "message/rfc822" } });
  }
  const options: R2GetOptions = {};
  const match = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null;
  if (range && !match)
    throw new AppError("RANGE_INVALID", "Only one byte range is supported.", 416);
  if (match) {
    const offset = Number(match[1]);
    const end = match[2] ? Number(match[2]) : undefined;
    options.range = end === undefined ? { offset } : { offset, length: end - offset + 1 };
  }
  const object = await env.MAIL_OBJECTS.get(row.raw_r2_key, options);
  if (!object?.body)
    throw new AppError("MESSAGE_BODY_MISSING", "Message body is unavailable.", 404);
  const headers = new Headers({
    "accept-ranges": "bytes",
    "content-type": "message/rfc822",
    etag: object.httpEtag
  });
  const returnedRange = object.range;
  if (
    returnedRange &&
    "offset" in returnedRange &&
    typeof returnedRange.offset === "number" &&
    typeof returnedRange.length === "number"
  ) {
    const end = returnedRange.offset + returnedRange.length - 1;
    headers.set("content-range", `bytes ${returnedRange.offset}-${end}/${object.size}`);
    headers.set("content-length", String(returnedRange.length));
  } else {
    headers.set("content-length", String(object.size));
  }
  return new Response(object.body, { status: match ? 206 : 200, headers });
}
