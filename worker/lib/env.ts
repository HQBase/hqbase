import type { AuthContext } from "../auth/session";

type WorkerEnvOverrides = {
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
  HQBASE_INSTALLATION_ID?: string;
  HQBASE_INSTALL_MODE?: string;
  HQBASE_COMMUNITY_WORKER_NAME?: string;
  HQBASE_UPGRADE_WORKSPACE_HOSTNAME?: string;
  CLOUDFLARE_UPGRADE_OAUTH_CLIENT_ID?: string;
  PRO_UPGRADE_ORCHESTRATION_SECRET?: string;
  PRO_LICENSE_KEY?: string;
  PRO_JOBS?: Queue;
};

export type WorkerEnv = Omit<Cloudflare.Env, keyof WorkerEnvOverrides> & WorkerEnvOverrides;

export type HonoApp = {
  Bindings: WorkerEnv;
  Variables: {
    auth: AuthContext;
    correlationId: string;
  };
};
