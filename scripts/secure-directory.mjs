import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { spawnProcess } from "./shell.mjs";
import { windowsSystem32Executable } from "./windows-system32.mjs";

const isWindows = process.platform === "win32";
const WHOAMI = windowsSystem32Executable("whoami.exe");
const ICACLS = windowsSystem32Executable("icacls.exe");

// Windows keeps the machine's trusted principals on every directory, and a member of
// Administrators can read any file regardless of its access control list by taking ownership or
// with SeBackupPrivilege. Excluding them is neither achievable nor meaningful — POSIX mode 0700
// does not keep root out either. What has to be guaranteed is that no *other user* can reach the
// secrets, which is the same guarantee 0700 gives.
const ADMINISTRATIVE_TRUSTEES = new Set([
  "SY",
  "S-1-5-18", // LocalSystem
  "BA",
  "S-1-5-32-544" // BUILTIN\Administrators
]);

let cachedSid = null;

function runOrThrow(command, args) {
  const result = spawnProcess(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${`${result.stdout ?? ""}${result.stderr ?? ""}`.trim()}`);
  }
  return result.stdout ?? "";
}

// `whoami` is a plain executable, so it works in environments where PowerShell module
// autoloading is unavailable.
export function currentUserSid() {
  if (cachedSid) return cachedSid;
  const sid = /S-1-[\d-]+/.exec(runOrThrow(WHOAMI, ["/user", "/fo", "csv", "/nh"]))?.[0];
  if (!sid) throw new Error("Could not determine the SID of the current Windows account.");
  cachedSid = sid;
  return sid;
}

// `icacls /save` writes the directory name followed by its security descriptor in SDDL form.
// Reading the descriptor keeps this independent of the display language and of whether the path
// arrived in its long or 8.3 short form.
export function directorySecurityDescriptor(directory) {
  const aclFile = `${directory}.acl`;
  try {
    runOrThrow(ICACLS, [directory, "/save", aclFile, "/q"]);
    return readFileSync(aclFile, "utf16le").split(/\r?\n/)[1] ?? "";
  } finally {
    rmSync(aclFile, { force: true });
  }
}

// SDDL names well-known principals by two-letter alias rather than by SID, so trustees come back
// as a mix of aliases and raw SIDs.
export function directoryTrustees(directory) {
  return [...directorySecurityDescriptor(directory).matchAll(/\(([^)]*)\)/g)]
    .map((entry) => entry[1].split(";")[5])
    .filter((trustee) => Boolean(trustee));
}

function isCurrentAccount(trustee, sid) {
  if (trustee === sid) return true;
  // SDDL writes the machine's built-in Administrator as LA instead of as a SID.
  return trustee === "LA" && sid.endsWith("-500");
}

// Accounts with access that are neither the current one nor part of the machine's trusted set.
export function foreignTrustees(directory) {
  const sid = currentUserSid();
  return directoryTrustees(directory).filter(
    (trustee) => !isCurrentAccount(trustee, sid) && !ADMINISTRATIVE_TRUSTEES.has(trustee)
  );
}

function restrictDirectory(directory) {
  if (!isWindows) {
    chmodSync(directory, 0o700);
    return;
  }
  runOrThrow(ICACLS, [directory, "/inheritance:r", "/grant:r", `*${currentUserSid()}:(OI)(CI)F`]);
}

// Returns null when the directory is restricted, otherwise a description of what was observed.
// The description reaches the operator, so it has to say why the check rejected the directory.
function restrictionFailure(directory) {
  if (!isWindows) {
    const mode = statSync(directory).mode & 0o777;
    return mode === 0o700 ? null : `mode is 0${mode.toString(8)}, expected 0700`;
  }
  const foreign = foreignTrustees(directory);
  if (foreign.length > 0) {
    return `access is also granted to [${foreign.join(", ")}]`;
  }
  if (
    !directoryTrustees(directory).some((trustee) => isCurrentAccount(trustee, currentUserSid()))
  ) {
    return `the current account has no entry; descriptor was ${directorySecurityDescriptor(directory)}`;
  }
  return null;
}

// Creates a temporary directory no other user can read, and fails closed rather than returning
// one whose restriction could not be confirmed. Callers put short-lived secrets in here, so an
// unverified directory is worse than no directory at all.
export function createRestrictedDirectory(prefix, options = {}) {
  const restrict = options.restrict ?? restrictDirectory;
  const directory = mkdtempSync(resolve(tmpdir(), prefix));
  try {
    restrict(directory);
    const failure = restrictionFailure(directory);
    if (failure) {
      throw new Error(`The temporary directory ${directory} could not be restricted: ${failure}`);
    }
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
  return directory;
}
