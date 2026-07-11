import type { AuthContext } from "../auth/session";

export type WorkerEnv = Cloudflare.Env & {
  BETTER_AUTH_URL?: string;
  BILLING?: Fetcher;
  ENVIRONMENT?: string;
  HQBASE_BILLING_URL?: string;
  PRO_JOBS?: Queue;
};

export type HonoApp = {
  Bindings: WorkerEnv;
  Variables: {
    auth: AuthContext;
    correlationId: string;
  };
};
