# Sowind CRM v1.15.0 Release Manifest

- Release date: 2026-08-31
- Runtime: Node.js 22, MySQL 8.4
- Migration: `20260831000000_init`
- Production UI: `frontend/index.html` + `frontend/js/app.js`
- Application entry: `backend/dist/src/server.js`
- Secrets included: none
- Local database/storage included: none

## Verified

- TypeScript build: PASS
- Prisma schema validate: PASS
- Unit/contract tests: 19 PASS
- Real Gateway live tests: 2 SKIPPED (`RUN_SOWIND_LIVE_TESTS=false`)
- Production dependency audit: 0 known vulnerabilities
- Docker image build: PASS
- Docker image health + database smoke: PASS
- Browser RBAC/brand-scope UAT: PASS

See `docs/UAT_REPORT.md` for evidence boundaries and `docs/ISSUES.md` for production gates.

