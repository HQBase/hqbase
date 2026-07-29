import type { AuthContext } from "../auth/session";

type WorkerEnvOverrides = {
  CLOUDFLARE_OAUTH_CLIENT_ID?: string;
  CLOUDFLARE_OAUTH_REDIRECT_URI?: string;
  CLOUDFLARE_OAUTH_RELAY_URL?: string;
  BETTER_AUTH_URL?: string;
  ENVIRONMENT?: string;
  HQBASE_WORKER_NAME?: string;
  HQBASE_APP_VERSION?: string;
  HQBASE_RELEASE_MANIFEST_URL?: string;
  HQBASE_RELEASE_PUBLIC_KEY?: string;
  HQBASE_INSTALLATION_ID?: string;
  HQBASE_JOBS?: Queue;
  VAPID_PRIVATE_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_SUBJECT?: string;
};

export type WorkerEnv = Omit<Cloudflare.Env, keyof WorkerEnvOverrides> & WorkerEnvOverrides;

export type HonoApp = {
  Bindings: WorkerEnv;
  Variables: {
    auth: AuthContext;
    correlationId: string;
  };
};
