import assert from "node:assert/strict";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const sha = "cd95decd6e69a2d2a79dbf69e8db8ca40cfb88df";
const base = "https://www.gridworks.cn/crm_kivisense/";
const out = resolve("docs/qa-evidence-shadcn-phase2/uat"); await mkdir(out, { recursive: true });
const remoteSha = execFileSync("ssh", ["-o", "BatchMode=yes", "root@101.133.150.129", "cat /srv/kivisense-crm-uat/DEPLOYED_COMMIT"], { encoding: "utf8" }).trim();
assert.equal(remoteSha, sha);
const paths = ["index.html", "legacy/index.html", ...(await readdir("frontend/react-build", { recursive: true })).filter(p => /\.(js|css|html)$/.test(p)).map(p => "react-build/" + p)];
const checks = [];
for (const path of paths) {
  const local = createHash("sha256").update(await readFile(resolve("frontend", path))).digest("hex");
  const response = await fetch(base + path, { headers: { "cache-control": "no-cache" } }); assert.equal(response.status, 200);
  const live = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
  const runtime = execFileSync("ssh", ["-o", "BatchMode=yes", "root@101.133.150.129", `docker exec kivisense-crm-uat-backend-1 sha256sum /app/frontend/${path}`], { encoding: "utf8" }).split(/\s/)[0];
  assert.equal(live, local, path + " HTTPS mismatch"); assert.equal(runtime, local, path + " runtime mismatch");
  checks.push({ path, sha256: local, runtime, https: live, status: "PASS" });
}
const ready = await (await fetch(base + "api/ready")).json(); assert.equal(ready.status, "ready"); assert.equal(ready.database, "ok");
await writeFile(resolve(out, "artifact-parity.json"), JSON.stringify({ codeCommit: sha, deployedCommit: remoteSha, ready, checks }, null, 2));
console.log(JSON.stringify({ codeCommit: sha, files: checks.length, parity: "PASS", ready }));
