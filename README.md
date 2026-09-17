# Kivisense CRM Design Prototype

Frontend-only, fully interactive CRM product prototype for product design, UX, sales-flow, dashboard, and distributor-operation iteration.

## Run

```bash
npm install
npm run dev
npm run build
```

The prototype uses React, TypeScript, Vite, Semi Design, the Kivisense Semi theme, Recharts, a shared mock dataset, and LocalStorage persistence. No API server or database is required.

## Product scope

- `Lead → Qualified → Convert to Deal → Won / Lost`
- HQ and distributor Demo Users with frontend-only data scoping
- Lead list/detail, Deal list/Kanban/detail, shared Activity and communication workspace
- Organizations, Contacts, Products/Add-ons, Tasks, Distributors, Users, and filterable Dashboard
- Mock email, comments, calls, tasks, notes, attachments, and Reset Demo Data
- Independent Sowind member/brand operations, three-view Dashboard and Activity-centered Marketing V2 (physical/virtual prizes, reservations and readonly business data)
- Marketing staff redemption is a separate frontend surface, not a CRM workbench; no backend or external coupon service
- No price, revenue, discount, quotation amount, or other monetary fields

## Source layout

```text
frontend-react/
├── public/
├── src/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── mock/
│   ├── stores/
│   ├── styles/
│   ├── types/
│   └── utils/
├── package.json
├── tsconfig.json
└── vite.config.ts
```

The shared dataset lives in `frontend-react/src/mock/demo-data.ts`. The state store scopes records by the selected Demo User and writes mutations to `kivisense-crm-prototype-v1` in LocalStorage.

## Verify

```bash
npm run lint
npm test
npm run build
```

For current browser QA, build first and keep `npm --workspace frontend-react run preview -- --host 127.0.0.1 --port 4174` running. Execute `npm run qa:browser`, `npm run qa:dashboard`, and `npm run qa:marketing` (the V2 runner) against that build; override the URL with `PROTOTYPE_BASE_URL` when needed. These tests use isolated mock-data browser contexts, not the user's browser storage.

Marketing opens at `#marketing`; per-activity tabs own configuration and business data. The separate staff surface is `#redemption/<credential>`. V1 marketing data upgrades in the existing namespace only after an exact raw backup; there is no automatic clearing. See `docs/MARKETING_ACTIVITY_MODULE.md` and `docs/MARKETING_ACTIVITY_ACCEPTANCE.md` for the current rules, evidence and limits. Older V1 QA scripts/artifacts remain historical, not V2 acceptance.
