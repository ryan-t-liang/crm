import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const expectedCommit = process.env.EXPECTED_COMMIT;
const expectedPackageSha256 = process.env.EXPECTED_PACKAGE_SHA256;
const backupPath = process.env.UAT_BACKUP_PATH;
if (!expectedCommit || !/^[0-9a-f]{40}$/.test(expectedCommit)) throw new Error("EXPECTED_COMMIT must be a full Git SHA");
if (!expectedPackageSha256 || !/^[0-9a-f]{64}$/.test(expectedPackageSha256)) throw new Error("EXPECTED_PACKAGE_SHA256 must be a SHA-256 digest");
if (!backupPath || !/^\/srv\/kivisense-crm-backups\/[A-Za-z0-9._-]+$/.test(backupPath)) throw new Error("UAT_BACKUP_PATH must be an exact Kivisense UAT backup directory");

const base = "https://www.gridworks.cn/crm_kivisense/";
const host = "root@101.133.150.129";
const out = resolve("artifacts/uat-v4/deployment");
await mkdir(out, { recursive: true });
const remote = (command) => execFileSync("ssh", ["-o", "BatchMode=yes", host, command], { encoding: "utf8" }).trim();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const remoteCommit = remote("cat /srv/kivisense-crm-uat/DEPLOYED_COMMIT");
assert.equal(remoteCommit, expectedCommit);
const releaseShort = expectedCommit.slice(0, 12);
const remotePackageSha256 = remote(`sha256sum /srv/kivisense-crm-uat-releases/${releaseShort}.tar.gz`).split(/\s+/)[0];
assert.equal(remotePackageSha256, expectedPackageSha256);

const paths = [
  "index.html",
  ...(await readdir("frontend/react-build", { recursive: true }))
    .filter((path) => /\.(js|css|html)$/.test(path))
    .map((path) => `react-build/${path}`),
];
const files = [];
for (const path of paths) {
  const local = sha256(await readFile(resolve("frontend", path)));
  const response = await fetch(base + path, { headers: { "cache-control": "no-cache" } });
  assert.equal(response.status, 200, path);
  const https = sha256(Buffer.from(await response.arrayBuffer()));
  const runtime = remote(`docker exec kivisense-crm-uat-backend-1 sha256sum /app/frontend/${path}`).split(/\s+/)[0];
  assert.equal(https, local, `${path} HTTPS mismatch`);
  assert.equal(runtime, local, `${path} runtime mismatch`);
  files.push({ path, local, https, runtime, status: "PASS" });
}

const healthResponse = await fetch(base + "api/health", { headers: { "cache-control": "no-cache" } });
const readyResponse = await fetch(base + "api/ready", { headers: { "cache-control": "no-cache" } });
assert.equal(healthResponse.status, 200);
assert.equal(readyResponse.status, 200);
const health = await healthResponse.json();
const ready = await readyResponse.json();
assert.equal(health.status, "ok");
assert.equal(ready.status, "ready");
assert.equal(ready.database, "ok");

const migrationCount = Number(remote("docker exec -i sowind-crm-test-mysql-1 sh -c 'MYSQL_PWD=\"$MYSQL_ROOT_PASSWORD\" mysql -uroot -N -B kivisense_crm_uat -e \"SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;\"'"));
assert.equal(migrationCount, 9);
const backupHashCheck = remote(`cd ${backupPath} && sha256sum -c SHA256SUMS`);
for (const file of ["application.tgz", "attachments.tgz", "nginx.tgz", "database.sql.gz"]) assert.match(backupHashCheck, new RegExp(`${file.replace(".", "\\.")}: OK`));
const backupHashes = remote(`cat ${backupPath}/SHA256SUMS`);
const businessBefore = remote(`cat ${backupPath}/business-counts-before.tsv`);
const businessAfter = remote(`cat ${backupPath}/business-counts-after.tsv`);
assert.equal(businessAfter, businessBefore);
const protectedBefore = remote(`cat ${backupPath}/production-test-before.txt`);
const protectedAfter = remote(`cat ${backupPath}/production-test-after.txt`);
assert.equal(protectedAfter, protectedBefore);
const uatContainer = remote("docker inspect -f '{{.Config.Image}}|{{.Image}}|{{.State.Status}}|{{.State.StartedAt}}' kivisense-crm-uat-backend-1");
assert.match(uatContainer, new RegExp(`^kivisense-crm-uat:${releaseShort}\\|sha256:[0-9a-f]{64}\\|running\\|`));
const filesystem = remote("df -h / | tail -1");

const report = {
  verdict: "PASS",
  completedAt: new Date().toISOString(),
  target: base,
  expectedCommit,
  remoteCommit,
  package: { path: `/srv/kivisense-crm-uat-releases/${releaseShort}.tar.gz`, sha256: remotePackageSha256 },
  backup: { path: backupPath, hashCheck: backupHashCheck.split(/\r?\n/), hashes: backupHashes.split(/\r?\n/) },
  database: { migrationCount, businessCountsUnchanged: true, counts: businessAfter.split(/\r?\n/) },
  protectedEnvironments: { unchanged: true, snapshot: protectedAfter.split(/\r?\n/) },
  runtime: { container: uatContainer, health, ready, filesystem },
  files,
};
await writeFile(resolve(out, "artifact-parity.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ verdict: report.verdict, remoteCommit, files: files.length, migrationCount, backupHashFiles: report.backup.hashCheck.length, protectedEnvironmentsUnchanged: true, businessCountsUnchanged: true, ready }, null, 2));
