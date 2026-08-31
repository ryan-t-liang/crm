import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = { ...process.env };
try {
  for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    if (!(key in env)) env[key] = line.slice(index + 1);
  }
} catch {}

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Usage: node scripts/with-env.mjs <command> [...args]");
const result = spawnSync(command, args, { env, stdio: "inherit", shell: process.platform === "win32" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
