import type { WorkerEnv } from "../lib/env";

import { parseRawEmail } from "./parse-email";
import { storeInboundEmail } from "./store-email";

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: WorkerEnv
): Promise<Awaited<ReturnType<typeof storeInboundEmail>>> {
  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await parseRawEmail(raw);
  return storeInboundEmail(env.DB, env.MAIL_OBJECTS, {
    envelopeRecipient: message.to,
    raw,
    parsed
  });
}
