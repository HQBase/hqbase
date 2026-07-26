import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);

export const scriptsDir = path.dirname(currentFile);
export const rootDir = path.resolve(scriptsDir, "../..");
export const deploymentsRoot = path.join(rootDir, ".hqbase", "deployments");

export function rootPath(...parts) {
  return path.join(rootDir, ...parts);
}
