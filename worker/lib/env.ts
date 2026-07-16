import type { AuthContext } from "../auth/session";

type WorkerEnvOverrides = {
  BETTER_AUTH_URL?: string;
  ENVIRONMENT?: string;
  HQBASE_APP_VERSION?: string;
  HQBASE_CLOUDFLARE_OAUTH_CLIENT_ID?: string;
  HQBASE_CLOUDFLARE_OAUTH_REDIRECT_URI?: string;
  HQBASE_CLOUDFLARE_OAUTH_RELAY_URL?: string;
  HQBASE_UPGRADE_CLOUDFLARE_OAUTH_CLIENT_ID?: string;
  HQBASE_UPGRADE_CLOUDFLARE_OAUTH_REDIRECT_URI?: string;
  HQBASE_BILLING_URL?: string;
  HQBASE_INSTALLATION_ID?: string;
  HQBASE_RELEASES_URL?: string;
  HQBASE_RELEASE_PUBLIC_KEY?: string;
  HQBASE_WORKER_NAME?: string;
};

export type WorkerEnv = Omit<Cloudflare.Env, keyof WorkerEnvOverrides> & WorkerEnvOverrides;

export type HonoApp = {
  Bindings: WorkerEnv;
  Variables: {
    auth: AuthContext;
  };
};
