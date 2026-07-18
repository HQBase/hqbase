import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const files = await readdir("dist/assets");
const scripts = files.filter((file) => file.endsWith(".js"));
const contents = await Promise.all(
  scripts.map((file) => readFile(path.join("dist/assets", file), "utf8"))
);
const production = contents.join("\n");

for (const marker of ["/__ui/setup", "Setup UI lab", "Development fixtures only"]) {
  if (production.includes(marker)) {
    throw new Error(
      `The development-only setup gallery leaked into the production bundle: ${marker}`
    );
  }
}

console.log("Verified that the setup UI gallery is absent from the production bundle.");
