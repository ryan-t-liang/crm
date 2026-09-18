# Kivisense Admin Design — Best Practices

## 1. Design tokens

Use a small spacing system only:

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
| adjacent form fields | 20px |
| content within one section | 16–20px |
| section ↔ section | 32px |
| page header ↔ first content | 24px |
| desktop page horizontal padding | 24–32px |
| modal content padding | 24px |

Do not create arbitrary 13/18/27/36px gaps without a component-level reason.

## 2. Typography

Default hierarchy:

| Role | Size / line-height / weight |
|---|---|
| Page title | 24 / 32 / 600 |
| Modal title | 20 / 28 / 600 |
| Section title | 16 / 24 / 600 |
| Body | 14 / 22 / 400 |
| Field label | 13–14 / 20 / 500 |
| Help text | 12 / 18 / 400 |
| Table text | 14 / 20 / 400 |

Avoid oversized headings in dense operational screens.

## 3. Surface model

Use at most three visual layers:

1. Application background.
2. Main content surface.
3. Interactive/elevated surface such as modal, popover, selected row, compact summary card.

Avoid chains such as:

`gray page → gray sidebar → white drawer → gray stepper → white cards → gray form blocks`.

## 4. Content width

A full-width page may span the viewport, but text and configuration content should not stretch indefinitely.

Recommended defaults:

- record/configuration text content: 960–1100px max when possible;
- quick-create modal: 640–800px;
- focused edit drawer: 520–720px;
- wide data tables: full available width;
- dashboard summary grids: full available width with consistent columns.

Do not place two short definition fields at opposite edges of a 1600px screen.

## 5. Forms

- Prefer 1–2 columns.
- Two columns only when fields are semantically equal and short enough.
- Full-width fields for rich text, rules, descriptions, large selectors, and complex editors.
- Keep labels above controls unless an existing Kivisense pattern clearly requires otherwise.
- Use help text only when it changes user behavior.
- Hide irrelevant fields based on the selected business mode.

## 6. Tables

- Default row height: roughly 48–52px.
- Keep headers concise.
- Put row actions at the right edge.
- Prefer `Edit` + `…` rather than many equal actions.
- Do not show analytics/KPI columns in an index list unless they materially help scan and choose a record.
- Empty tables should use a bounded empty state rather than a giant blank viewport.

## 7. Tabs and sub-navigation

Primary Tabs:

- use line style;
- concise labels;
- ideally 3–5 items;
- represent major mental models, not database tables.

Secondary navigation:

- lighter visual treatment;
- no large blue filled block;
- no duplicate card-like tabs below primary tabs.

## 8. Cards

Use cards for information that deserves its own visual object.

Good:

- KPI summary;
- customer/company summary;
- alert requiring attention;
- independent object preview.

Bad:

- every field group;
- every section of a form;
- table wrapper with no additional meaning;
- nested cards.

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
