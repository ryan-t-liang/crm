# Kivisense Admin Design — Patterns

## Pattern A — List Page

Use for collections of business objects.

Structure:

```text
Page title                         [Primary create]
Optional one-line subtitle

[Search] [Filter] [Filter]

Table
```

Rules:

- one primary create button;
- reuse CRM `PageHeader` actions, `data-surface`, `table-toolbar` and Semi Table defaults;
- filters on one row where space allows;
- show only fields needed to identify, compare, and choose a record;
- clicking the main record identifier/name opens detail;
- row actions: `编辑` + `…` when edit is common;
- no KPI dashboard above a normal operational list unless explicitly required.

## Pattern B — Quick Create SideSheet

Default for normal record creation.

Use when the record can exist after a small set of core fields is completed.

Recommended size:

- 520–720px wide, capped at the viewport;
- right-side Semi SideSheet with existing CRM header, close, body scrolling and `sheet-footer` actions; reuse `FormSideSheet`;
- 1–2 columns;
- one primary action.

Structure:

```text
Title                                      ×

Core fields
Core fields
Optional large field

                         Cancel   Create
```

Rules:

- no stepper;
- no left navigation;
- no nested cards;
- no advanced configuration that can be done after record creation;
- create first, configure later.

## Pattern C — Edit SideSheet

Use the same right-side SideSheet, form and field order as Quick Create whenever possible. Centered Modals are reserved for confirmations, not new/edit forms.

Do not maintain two unrelated forms for create and edit.

Footer:

`取消` + `保存`

## Pattern D — Record Detail Page

Use for a persistent business object.

Canonical Kivisense CRM structure:

`App Sidebar + Top Header + Page Header + Main Card + Optional Right Information Rail`

Reuse the Lead / Deal / Customer / Member detail shell: `DetailWorkspace`, `SideSection`, `DataList`, `detail-grid`, `record-tabs`. The existing grid uses a 290px rail and shared responsive behavior; do not invent a module-specific layout or change the reference pages.

Header:

```text
← Back

Record Name                                 [Primary] [Secondary] [...]
Identifier · type · owner/brand
Status · important time/location metadata

Main Card: Primary Tabs + current content     Right Rail: business information
```

Rules:

- keep the header compact;
- status belongs near the record identity;
- keep important time/location metadata compact in the header;
- allow Right Rail Info Cards for real identity, relationships and capability-dependent business windows;
- never use the rail for `后台职责` or architecture explanations;
- keep primary Tabs inside the main Card, using existing CRM line Tabs styling;
- advanced operations live in `…`;
- detail page owns configuration and related records.

## Pattern E — Record Tabs

Primary tabs group user mental models, not implementation tables.

Preferred groups:

- Overview
- Settings / Configuration
- Related Activity / Participation
- Outcome / History

Keep major tabs to approximately 3–5 where practical.

Secondary navigation can group subareas under a major tab, but must be visually lighter.

Use the shared CRM `record-tabs` treatment. Do not write Marketing-specific primary Tabs border, color or selection CSS; secondary navigation stays text / small underline, not large filled buttons.

## Pattern F — Configuration Page

Use for editable settings on an existing object.

Structure:

```text
Section title
optional 1-line help
fields / definition grid / compact actions

------------------------------

Next section
```

Allow one main information Card; when the record workspace already supplies it, do not add another decorative shell. Use flat groups inside that workspace. The rejection is fragmented Cards, not forms in Cards.

For read-only summary fields, use a compact definition grid rather than an ERP-style horizontal-line table.

## Pattern G — Focused Edit Drawer

Use for editing one coherent subject without leaving the record page:

- booking rules;
- draw rules;
- prize details;
- a single complex relation;
- a medium-sized settings group.

Recommended width: 520–720px.

Do not embed a second application shell, step navigation, dashboard, or long record history inside the drawer.

## Pattern H — Related Data Table

Use for participation, bookings, audit records, awards, tasks, notes, etc.

Structure:

```text
Subnav / page title

[Search] [Status] [Date] [Type]

Table
```

Empty state should be bounded to the table area, generally around 240–300px, not a full blank page.

Reuse CRM `data-surface`, `table-toolbar`, Semi Table and `EmptyBlock`; preserve the same header, row, hover, action and empty-state styling rather than overriding it for a module.

## Pattern I — Dashboard / Summary

Do not automatically convert a record overview into a BI dashboard.

Use compact grouped business Summary Cards rather than naked full-width numbers or many same-sized KPI cards. Reuse an existing CRM summary surface such as `chart-panel`; each Card groups related measures, not one Card per metric. Do not add nested Card layers inside a summary.

Example:

```text
Participation
Participants   Checked in   Completed   Winners

Draw
Draw users     Draw count   Awards

Claim
Pending        Booked       Claimed
```

A KPI card grid is appropriate only when each KPI truly deserves independent emphasis.

## Pattern J — Destructive Confirmation

Use a compact modal or Popconfirm.

Structure:

- what will happen;
- irreversible consequence if any;
- cancel;
- danger action.

No architecture essay.

## Pattern K — Quick Inspect Side Panel

Use when the user needs to inspect a row without losing list context.

Show only:

- key identity;
- key fields;
- recent activity;
- `打开详情` when deeper work is needed.

Do not cram the full detail page into a side panel.
