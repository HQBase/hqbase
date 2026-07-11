export function parseArgs(argv) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    if (!rawKey) {
      continue;
    }

    if (rawKey.startsWith("no-")) {
      flags[rawKey.slice(3)] = false;
      continue;
    }

    if (inlineValue !== undefined) {
      flags[rawKey] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags[rawKey] = next;
      index += 1;
    } else {
      flags[rawKey] = true;
    }
  }

  return { flags, positionals };
}

export function requireString(flags, key) {
  const value = flags[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  throw new Error(`Missing required --${key}.`);
}

export function optionalString(flags, key) {
  const value = flags[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function optionalBoolean(flags, key, defaultValue = false) {
  const value = flags[key];
  return typeof value === "boolean" ? value : defaultValue;
}
