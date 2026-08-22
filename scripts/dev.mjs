import { spawn } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const worker = spawn(pnpm, ["build"], { stdio: "inherit" });

let vite;
let wrangler;
let shuttingDown = false;

function stop(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  vite?.kill("SIGTERM");
  wrangler?.kill("SIGTERM");
  if (worker.exitCode === null) worker.kill("SIGTERM");
  process.exitCode = exitCode;
}

worker.once("error", () => stop(1));
worker.once("exit", (code, signal) => {
  if (shuttingDown) return;
  if (code !== 0 || signal) {
    stop(code ?? 1);
    return;
  }

  wrangler = spawn(pnpm, ["exec", "wrangler", "dev", "--port", "8787"], {
    stdio: "inherit"
  });
  vite = spawn(pnpm, ["exec", "vite", "--host", "127.0.0.1", "--port", "5173"], {
    stdio: "inherit"
  });

  for (const child of [wrangler, vite]) {
    child.once("error", () => stop(1));
    child.once("exit", (childCode, childSignal) => {
      if (!shuttingDown && (childCode !== 0 || childSignal)) stop(childCode ?? 1);
    });
  }
});

process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
