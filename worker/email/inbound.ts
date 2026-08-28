import type { WorkerEnv } from "../lib/env";

import { resolveInboundRoute } from "./inbound-route";
import { parseRawEmail } from "./parse-email";
import { storeInboundEmail } from "./store-email";

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: WorkerEnv
): Promise<Awaited<ReturnType<typeof storeInboundEmail>> | null> {
  const route = await resolveInboundRoute(env.DB, message.to);
  if (route.action === "reject") {
    message.setReject("Unknown recipient.");
    return null;
  }
  const raw = await new Response(message.raw).arrayBuffer();
  const parsed = await parseRawEmail(raw);
  return storeInboundEmail(env.DB, env.MAIL_OBJECTS, {
    envelopeRecipient: message.to,
    mailboxId: route.mailboxId,
    raw,
    parsed
  });
}
