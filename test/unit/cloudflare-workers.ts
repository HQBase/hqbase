export abstract class DurableObject<Env = Cloudflare.Env, Props = unknown> {
  protected readonly ctx: DurableObjectState<Props>;
  protected readonly env: Env;

  constructor(ctx: DurableObjectState<Props>, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}
