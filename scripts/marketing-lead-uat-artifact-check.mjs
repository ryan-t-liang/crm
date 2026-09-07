import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const expectedCommit = process.env.EXPECTED_COMMIT;
if (!expectedCommit || !/^[0-9a-f]{40}$/.test(expectedCommit)) throw new Error("EXPECTED_COMMIT must be a full Git SHA");
const base = "https://www.gridworks.cn/crm_kivisense/";
const out = resolve("docs/qa-evidence-marketing-lead/uat");
await mkdir(out, { recursive: true });
const remoteCommit = execFileSync("ssh", ["-o", "BatchMode=yes", "root@101.133.150.129", "cat /srv/kivisense-crm-uat/DEPLOYED_COMMIT"], { encoding: "utf8" }).trim();
assert.equal(remoteCommit, expectedCommit);

const paths = ["index.html", ...(await readdir("frontend/react-build", { recursive: true })).filter((path) => /\.(js|css|html)$/.test(path)).map((path) => `react-build/${path}`)];
const checks = [];
for (const path of paths) {
  const local = createHash("sha256").update(await readFile(resolve("frontend", path))).digest("hex");
  const response = await fetch(base + path, { headers: { "cache-control": "no-cache" } });
  assert.equal(response.status, 200, path);
  const https = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
  const runtime = execFileSync("ssh", ["-o", "BatchMode=yes", "root@101.133.150.129", `docker exec kivisense-crm-uat-backend-1 sha256sum /app/frontend/${path}`], { encoding: "utf8" }).split(/\s/)[0];
  assert.equal(https, local, `${path} HTTPS mismatch`);
  assert.equal(runtime, local, `${path} runtime mismatch`);
  checks.push({ path, local, https, runtime, status: "PASS" });
}
const health = await (await fetch(base + "api/health", { headers: { "cache-control": "no-cache" } })).json();
const ready = await (await fetch(base + "api/ready", { headers: { "cache-control": "no-cache" } })).json();
assert.equal(health.status, "ok");
assert.equal(ready.status, "ready");
assert.equal(ready.database, "ok");
await writeFile(resolve(out, "artifact-parity.json"), JSON.stringify({ verdict: "PASS", expectedCommit, remoteCommit, health, ready, files: checks }, null, 2));
console.log(JSON.stringify({ verdict: "PASS", expectedCommit, remoteCommit, health, ready, files: checks.length }));
