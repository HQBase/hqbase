import type { AuthContext } from "../auth/session";

type WorkerEnvOverrides = {
  CLOUDFLARE_OAUTH_MODE?: string;
  CLOUDFLARE_OAUTH_CLIENT_ID?: string;
  BETTER_AUTH_URL?: string;
  ENVIRONMENT?: string;
  HQBASE_WORKER_NAME?: string;
  HQBASE_APP_VERSION?: string;
  HQBASE_RELEASE_MANIFEST_URL?: string;
  HQBASE_RELEASE_PUBLIC_KEY?: string;
  HQBASE_INSTALLATION_ID?: string;
  HQBASE_JOBS?: Queue;
};

export type WorkerEnv = Omit<Cloudflare.Env, keyof WorkerEnvOverrides> & WorkerEnvOverrides;

export type HonoApp = {
  Bindings: WorkerEnv;
  Variables: {
    auth: AuthContext;
    correlationId: string;
  };
};
