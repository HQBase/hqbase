import { win32 } from "node:path";

export function windowsSystem32Executable(executable, environment = process.env) {
  const systemRoot = environment.SystemRoot || "C:\\Windows";
  return win32.resolve(systemRoot, "System32", executable);
}
