import { z } from "zod";
import { getSetting, setSetting } from "../../db/client";

const channelSchema = z.enum(["stable", "nightly"]);
export type UpdateChannel = z.infer<typeof channelSchema>;

export async function getUpdateChannel(db: D1Database): Promise<UpdateChannel> {
  return (await getSetting(db, "update_channel", channelSchema)) ?? "stable";
}

export async function setUpdateChannel(db: D1Database, channel: UpdateChannel): Promise<void> {
  await setSetting(db, "update_channel", channelSchema.parse(channel));
}
