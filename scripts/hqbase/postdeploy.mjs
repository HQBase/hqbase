const lines = [
  "🎉 HQBase is deployed.",
  "",
  "Your workspace is almost ready:",
  "1. Open the Worker URL printed above and visit /setup.",
  "2. Create and verify the temporary token shown in the permission table.",
  "3. Choose a domain; HQBase configures Cloudflare before continuing.",
  "4. Create the owner sign-in and your first shared mailboxes.",
  "",
  "Email works after the setup page marks the domain ready."
];

export function printPostDeploy() {
  const width = Math.max(...lines.map((line) => visibleLength(line))) + 4;
  const border = `+${"-".repeat(width - 2)}+`;

  console.log("");
  console.log(border);
  for (const line of lines) {
    console.log(`| ${padRight(line, width - 4)} |`);
  }
  console.log(border);
  console.log("");
}

function padRight(value, width) {
  return `${value}${" ".repeat(Math.max(0, width - visibleLength(value)))}`;
}

function visibleLength(value) {
  return [...value].length;
}
