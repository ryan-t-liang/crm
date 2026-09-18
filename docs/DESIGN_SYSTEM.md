# Kivisense CRM prototype design system

The CRM uses Semi Design, Semi Icons, `@semi-bot/semi-theme-kivicrm`, and the Kivisense logo as its single product foundation. React components provide behavior; `frontend-react/src/index.css` and `frontend-react/src/styles/` own application styling.

## Product character

- Dense, calm, structured, professional, and data-rich.
- Desktop-first at 1440, 1600, and 1920 pixels, with a usable collapsed navigation state at narrower desktop widths.
- Restrained radii, borders, shadows, color, and whitespace.
- Clear hierarchy through tables, toolbars, tabs, timelines, and a shared detail workspace—not card-wall dashboards.

## Shared patterns

- App shell: persistent sidebar, compact top bar, current Demo User, and scope indicator.
- Lists: concise page header, metrics, search/filter toolbar, table or Kanban content, pagination, and internal horizontal scroll when needed.
- Details: breadcrumb/back action, record title, owner/status actions, primary workspace tabs, and a 290-pixel contextual sidebar.
- Feedback: Semi Toast, Banner, Skeleton, Empty, Modal confirmation, disabled controls, and visible focus states.
- Activity: every meaningful Lead or Deal mutation adds a chronological event with actor, type, time, title, and detail.
- Member operations: reuse the same list/detail shell, tables, compact filters, tags, and information density; distinguish brand scope through restrained GP/UN tags rather than a separate visual system.

## Guardrails

- No competing component library, gradient-heavy marketing UI, huge titles, oversized cards, or decorative empty space.
- No monetary fields or analytics.
- No server UI assumptions. Authentication, distributor scope, communications, files, and persistence are explicitly simulated in the browser.
- Product terms are `Lead`, `Qualified`, `Deal`, and `Won/Lost`. There is no separate sales-opportunity module.
- Marketing uses the scoped object-first list/form/detail rules in [MARKETING_UI_DESIGN_RULES.md](MARKETING_UI_DESIGN_RULES.md), rather than a creation wizard or metric-heavy activity list.
- `集团客户`, `品牌会员`, and `品牌购买意向` belong to a separate member operations workspace. Do not present brand Purchase Intents as Sales Leads or merge brand profile fields into sales Contact forms.
- Sowind raw values remain visible and traceable: `gp` / `un` are not recoded, numeric enum values retain their number, `NULL` has an explicit empty treatment, unknown dictionary codes display the raw code plus “字典待配置”, and profile/intent region values use separate labels.
