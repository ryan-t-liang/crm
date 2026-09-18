# Kivisense Admin Design — Best Practices

## 1. Design tokens

For existing CRM modules, reuse the mature Lead / Deal / Customer / Member components and their spacing. `app.css` and `components.css` are authoritative; preserve their compact values instead of restyling the baseline pages. The values below are fallbacks when there is no established CRM pattern:

- 4
- 8
- 12
- 16
- 20
- 24
- 32
- 40

Default applications:

| Relationship | Spacing |
|---|---:|
| icon ↔ text | 8px |
| label ↔ field | 8px |
| adjacent form fields | 12–20px; existing `form-grid` wins |
| content within one section | 16–20px |
| section ↔ section | 12–20px in compact record workspaces |
| page header ↔ first content | shared `detail-header` / `page-header` spacing |
| desktop page horizontal padding | shared `page` / `detail-page` spacing |
| information Card padding | 16–20px where appropriate; shared component wins |
| modal content padding | existing CRM Semi Modal default |

Do not create arbitrary 13/18/27/36px gaps without a component-level reason.

## 2. Typography

Do not invent module-specific typography. Reuse the existing CRM hierarchy:

| Role | Existing source |
|---|---|
| Page title | `page-header` |
| Record title / metadata | `detail-title`, `detail-tags` |
| Modal title / buttons | CRM Semi Modal defaults |
| Section title | `tab-panel-header`, `side-section`, `chart-panel` |
| Readonly business fields | `data-list` hierarchy |
| Form label / fields | `form-grid`, `form-stack`, Semi controls |
| Help text | `form-hint` / existing shared helper styling |
| Table header / row / actions | Semi Table defaults and existing CRM row composition |

Avoid oversized headings in dense operational screens.

## 3. Surface model

Use at most three visual layers:

1. Application background.
2. Main content surface.
3. Interactive/elevated surface such as modal, popover, selected row, compact summary card.

Avoid chains such as:

`gray page → gray sidebar → white drawer → gray stepper → white cards → gray form blocks`.

The established CRM surface model is `crm-canvas` page background + white `crm-surface` Cards + light `crm-border`, using `crm-radius`. Reuse these tokens and classes; do not create approximate colors or change global tokens for a module.

## 4. Content width

A full-width page may span the viewport, but text and configuration content should not stretch indefinitely.

Recommended defaults:

- record/configuration text content: 960–1100px max when possible;
- quick-create SideSheet: 520–720px, capped at the viewport;
- focused edit drawer: 520–720px;
- wide data tables: full available width;
- dashboard summary grids: full available width with consistent columns.

Do not place two short definition fields at opposite edges of a 1600px screen.

## 5. Forms

- Prefer 1–2 columns.
- Two columns only when fields are semantically equal and short enough.
- Full-width fields for rich text, rules, descriptions, large selectors, and complex editors.
- All new/edit forms use right-side Semi SideSheet / shared `FormSideSheet` and `sheet-footer`, with body scrolling; no module-specific header/footer/title redesign. Modals remain for confirmations only.
- Keep ordinary rich text around 160–200px high initially, using the existing CRM `rich-editor` / `rich-editor-toolbar` surface rather than a CMS-sized editor.
- Keep labels above controls unless an existing Kivisense pattern clearly requires otherwise.
- Use help text only when it changes user behavior.
- Hide irrelevant fields based on the selected business mode.

## 6. Tables

- Reuse Lead / Deal / Task table header, row height, borders, hover, actions and empty states. Do not add module-specific Semi Table cell padding / typography overrides.
- Keep headers concise.
- Put row actions at the right edge.
- Prefer `Edit` + `…` rather than many equal actions.
- Do not show analytics/KPI columns in an index list unless they materially help scan and choose a record.
- Empty tables should use a bounded empty state rather than a giant blank viewport.

## 7. Tabs and sub-navigation

Primary Tabs:

- use line style;
- put Tabs inside the main Card and reuse `record-tabs` styling;
- concise labels;
- ideally 3–5 items;
- represent major mental models, not database tables.

Secondary navigation:

- lighter visual treatment;
- no large blue filled block;
- no duplicate card-like tabs below primary tabs.

## 8. Cards

Prohibit fragmented Cards, not forms in Cards. Keep the CRM's clear visual boundaries.

Good:

- one main information / record-workspace Card;
- compact business Summary Cards grouping related metrics;
- Right Rail Info Cards with actual business fields;
- the standard CRM table container;
- customer/company summary;
- alert requiring attention;
- independent object preview.

Bad:

- every field group;
- every section of a form;
- redundant decorative wrapper around an existing Card or table container;
- Cards nested inside a business Summary Card;
- meaningless explanation Cards, including `后台职责`.

Record detail defaults to `App Sidebar + Top Header + Page Header + Main Card + Optional Right Information Rail`. Use `DetailWorkspace`, `SideSection`, `DataList`, `detail-grid`, `record-tabs`, `data-surface` and `table-toolbar`. The existing grid / responsive rail behavior wins over arbitrary module-specific percentages or breakpoints.

## 9. Status

Use low-saturation tags. A list should generally show one primary lifecycle status, not every sub-status at once.

If multiple phases exist, expose them in the detail page, timeline, or popover rather than multiplying list status labels.

## 10. Destructive actions

- Put low-frequency destructive actions inside `More` unless they are the page's explicit purpose.
- Use clear Chinese labels.
- Confirm destructive operations.
- Do not add long architecture explanations to confirmation dialogs.

## 11. Business copy

Write what the operator needs to understand now.

Good:

- `预约参与`
- `直接参与`
- `预约领取`
- `直接领取`
- `活动规则`
- `中奖记录`
- `核销记录`

Bad:

- `履约状态聚合`
- `当前原型不支持...`
- `业务归属属于本活动`
- `前端本地状态`

## 12. Object-first product model

A list creates a record. A record detail page manages that record. Related configuration belongs to that record after it exists.

This is the default Kivisense mental model for CRM/admin products.
