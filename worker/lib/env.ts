import type { AuthContext } from "../auth/session";

export type WorkerEnv = Cloudflare.Env & {
  BETTER_AUTH_URL?: string;
  BILLING?: Fetcher;
  ENVIRONMENT?: string;
  HQBASE_BILLING_URL?: string;
  HQBASE_WORKER_NAME?: string;
  PRO_JOBS?: Queue;
};

export type HonoApp = {
  Bindings: WorkerEnv;
  Variables: {
    auth: AuthContext;
    correlationId: string;
  };
};
