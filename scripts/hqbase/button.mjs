import fs from "node:fs";

import { rootPath } from "./paths.mjs";

const buttonPattern =
  /\[!\[Deploy to Cloudflare\]\(https:\/\/deploy\.workers\.cloudflare\.com\/button\)\]\(https:\/\/deploy\.workers\.cloudflare\.com\/\?url=[^)]+\)/;

export function deployButtonMarkdown(repoUrl) {
  validateRepoUrl(repoUrl);
  const encoded = encodeURIComponent(repoUrl);
  return `[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=${encoded})`;
}

export function updateDeployButton(repoUrl, options = {}) {
  const readmePath = rootPath("README.md");
  const readme = fs.readFileSync(readmePath, "utf8");
  const replacement = deployButtonMarkdown(repoUrl);

  if (options.dryRun) {
    console.log(replacement);
    return;
  }

  if (!buttonPattern.test(readme)) {
    throw new Error("Could not find the Deploy to Cloudflare button in README.md.");
  }
  fs.writeFileSync(readmePath, readme.replace(buttonPattern, replacement));
  console.log(`Updated README Deploy button to ${repoUrl}`);
}

function validateRepoUrl(repoUrl) {
  if (!/^https:\/\/(github|gitlab)\.com\/[^/\s]+\/[^/\s]+\/?$/.test(repoUrl)) {
    throw new Error("Deploy button repo URL must be a public GitHub or GitLab repository URL.");
  }
}
