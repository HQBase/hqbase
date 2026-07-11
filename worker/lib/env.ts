import type { AuthContext } from "../auth/session";

export type WorkerEnv = Cloudflare.Env & {
  BETTER_AUTH_URL?: string;
  ENVIRONMENT?: string;
};

export type HonoApp = {
  Bindings: WorkerEnv;
  Variables: {
    auth: AuthContext;
  };
};
