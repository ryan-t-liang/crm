import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../frontend/", import.meta.url));
const brands = [
  { id: "brand-un", code: "UN", name: "UN 雅典表", shortName: "UN", themeConfig: {} },
  { id: "brand-gp", code: "GP", name: "GP 芝柏表", shortName: "GP", themeConfig: {} },
];
const customers = [
  { id: "customer-1", customerNo: "SW00000001", displayName: "测试会员一", mobile: "+8613800000001", createdAt: "2026-09-02T08:00:00.000Z", profiles: [{ brand: brands[0], favoriteCollection: "FREAK", ownsBrandWatch: true }] },
  { id: "customer-2", customerNo: "SW00000002", displayName: "测试会员二", mobile: "+8613800000002", createdAt: "2026-09-02T09:00:00.000Z", profiles: [{ brand: brands[1], favoriteCollection: "Laureato", ownsBrandWatch: false }] },
];
const leads = [
  { id: "lead-1", leadNo: "PI-UN-TEST-001", source: "ADMIN_MANUAL", brand: brands[0], lastname: "测", firstname: "试一", phone: "+8613800000001", sku: "TEST-UN", status: "NEW", syncStatus: "NOT_SYNCED", createdAt: "2026-09-02T08:00:00.000Z", ownerUserId: null },
  { id: "lead-2", leadNo: "PI-GP-TEST-002", source: "ADMIN_MANUAL", brand: brands[1], lastname: "测", firstname: "试二", phone: "+8613800000002", sku: "TEST-GP", status: "NEW", syncStatus: "NOT_SYNCED", createdAt: "2026-09-02T09:00:00.000Z", ownerUserId: null },
];

function sendJson(response, payload) {
  response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

const server = createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/api/v1/auth/me") return sendJson(response, { data: { id: "qa-user", name: "交互测试管理员", loginAccount: "qa@example.test", mustChangePassword: false, allBrands: true, role: { key: "SUPER_ADMIN", name: "超级管理员" }, permissions: ["customer.view", "lead.view"] } });
  if (url.pathname === "/api/v1/brands") return sendJson(response, { data: brands });
  if (url.pathname === "/api/v1/customers") return sendJson(response, { data: customers, meta: { total: customers.length, pageCount: 1 }, metrics: { memberTotal: customers.length, dualBrandMembers: 0, marketingCoverage: { percentage: 0 } } });
  if (url.pathname === "/api/v1/leads") return sendJson(response, { data: leads, meta: { total: leads.length, pageCount: 1 }, metrics: { leadTotal: leads.length, pending: 0, gatewayAccepted: 0, syncExceptions: 0 } });

  const relativePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  const filePath = normalize(join(frontendRoot, relativePath));
  if (!filePath.startsWith(frontendRoot)) { response.writeHead(403); return response.end(); }
  try {
    if (!statSync(filePath).isFile()) throw new Error("not a file");
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
    response.writeHead(200, { "content-type": `${types[extname(filePath)] || "application/octet-stream"}; charset=utf-8`, "cache-control": "no-store" });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(8766, "127.0.0.1", () => console.log("Frontend browser fixture listening on http://127.0.0.1:8766"));
