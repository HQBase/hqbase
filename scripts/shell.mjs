import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// pnpm and wrangler are installed as `.cmd` shims on Windows, which CreateProcess cannot launch
// directly. cross-spawn resolves the shim and builds the command line itself, so argv reaches
// the child unchanged. Node's `shell` option is not an alternative here: it concatenates
// arguments without escaping them (DEP0190) and still lets cmd.exe expand `%VAR%` inside quoted
// arguments, which would silently corrupt SQL and any value containing a percent sign.
export function spawnProcess(command, args = [], options = {}) {
  if (process.platform === "win32") {
    return require("cross-spawn").sync(command, args, options);
  }
  return spawnSync(command, args, options);
}
