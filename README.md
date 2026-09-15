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

For browser QA, keep `npm run dev` running and execute `npm run qa:browser`. See `docs/prototype-browser-qa-evidence.md` for coverage and `docs/prototype-qa-issues.md` for explicit prototype limitations.
