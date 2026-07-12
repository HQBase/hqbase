import { z } from "zod";

export const verifyUpgradeCutoverSchema = z.object({
  apiToken: z.string().trim().min(20).max(500)
});
