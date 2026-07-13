import type { AuthContext } from "../auth/session";

export type WorkerEnv = Cloudflare.Env & {
  CLOUDFLARE_OAUTH_CLIENT_ID?: string;
  BETTER_AUTH_URL?: string;
  BILLING?: Fetcher;
  ENVIRONMENT?: string;
  HQBASE_BILLING_URL?: string;
  HQBASE_WORKER_NAME?: string;
  HQBASE_APP_VERSION?: string;
  HQBASE_RELEASES_URL?: string;
  HQBASE_RELEASE_PUBLIC_KEY?: string;
  HQBASE_SETUP_OAUTH_ACCESS_TOKEN?: string;
  PRO_LICENSE_KEY?: string;
  PRO_JOBS?: Queue;
};

export type HonoApp = {
  Bindings: WorkerEnv;
  Variables: {
    auth: AuthContext;
    correlationId: string;
  };
};
