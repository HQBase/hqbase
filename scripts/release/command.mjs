import { execFileSync, spawnSync } from "node:child_process";

function commandEnvironment() {
  return { ...process.env, CI: process.env.CI ?? "true" };
}

export function run(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    env: commandEnvironment(),
    stdio: "inherit"
  });
}

export function capture(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    env: commandEnvironment(),
    encoding: "utf8"
  });
}

export function attemptRun(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    env: commandEnvironment(),
    encoding: "utf8"
  });
}

export function emitCommandOutput(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}
