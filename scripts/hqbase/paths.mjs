import path from "node:path";
export const rootDir = path.resolve(import.meta.dirname, "../..");
export const deploymentsRoot = path.join(rootDir, ".hqbase", "deployments");

export function rootPath(...parts) {
  return path.join(rootDir, ...parts);
}
