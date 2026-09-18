---
name: kivisense-admin-design
description: Mandatory UI/UX rules for Kivisense enterprise admin and CRM interfaces. Use before creating or modifying any list, detail, create/edit form, modal, drawer, tabs, tables, settings, CRM record page, marketing activity, member, lead, deal, dashboard, or system-management UI. Semi Design is the component baseline. Prefer object-first quick create, record detail for progressive configuration, compact enterprise density, and fixed Kivisense patterns. Do not invent new interaction patterns when an existing pattern applies.
---

# Kivisense Admin Design Skill

This skill is the default UI contract for Kivisense admin products. It exists to stop page-by-page visual improvisation.

## Mandatory rule

Before changing any admin UI, determine the page type and select an existing Kivisense pattern. Do not start styling components until the pattern is chosen.

Priority order:

1. Existing Kivisense Design rule in this skill.
2. Existing Kivisense screen that already follows this skill.
3. Semi Design component semantics and interaction behavior.
4. External product references for interaction principles only.

Do not invent a fifth design language.

## Product references

Kivisense borrows interaction principles, not source code, from mature products such as Plane, Frappe CRM, Twenty, Linear, Stripe Dashboard, Shopify Admin, and HubSpot.

Key principles validated from those references:

- Create the core record quickly; configure deeper behavior after creation.
- Use a modal/dialog for normal record creation rather than a multi-step wizard.
- Use record detail pages for ongoing configuration and related records.
- Use side panels/drawers for quick inspection or focused editing, not as an entire application shell.
- Keep list pages scan-friendly and action-light.
- Reduce visual noise; prefer strong information hierarchy over decorative containers.

Do not copy AGPL application source from Plane, Frappe CRM, or the AGPL portions of Twenty into Kivisense. Re-implement patterns with Semi Design and Kivisense styles. Twenty packages explicitly marked MIT may be evaluated separately, but Semi Design remains the default component library.

## Required reading

For every UI task, read the relevant sections of:

- `BEST_PRACTICES.md`
- `PATTERNS.md`
- `ANTI_PATTERNS.md`
- `WORKFLOWS.md`

For Marketing Activity work, also read:

- `examples/MARKETING_ACTIVITY.md`

## Hard constraints

### 1. Object-first creation

Default creation flow:

`List → Create modal → Create record → Record detail → Configure advanced settings`

Do not use a wizard/stepper just because an object has many downstream capabilities.

A wizard is allowed only when all of these are true:

- the flow is truly sequential,
- later steps depend on irreversible earlier decisions,
- the user cannot reasonably save a valid core record before completing all steps,
- and the product owner explicitly approves a wizard.

If any condition is false, use quick create + detail configuration.

### 2. Semi Design baseline

Use existing Semi Design components before introducing custom equivalents:

- `Modal` for normal create/edit forms and confirmations;
- `SideSheet`/drawer for focused side editing or quick inspection;
- `Table` for record collections;
- `Tabs` type `line` for primary record navigation;
- `Form` for data entry;
- `Popconfirm`/`Modal` for destructive actions.

Do not introduce a competing design system.

### 3. No free-form layout invention

Before coding, classify the task as one of:

- List Page
- Quick Create Modal
- Record Detail Page
- Settings/Configuration Page
- Focused Edit Drawer
- Data Table Page
- Dashboard/Summary Page
- Destructive Confirmation

Then use the matching pattern in `PATTERNS.md`.

### 4. Creation form rule

A normal record with roughly 3–12 core fields should use a single modal. It must not become a full-screen drawer, multi-step stepper, or nested-card flow.

Advanced business configuration belongs after creation.

### 5. Drawer rule

Drawers/SideSheets are for:

- quick record inspection,
- focused edit of one coherent subject,
- secondary details without losing page context.

They are not for:

- five-step applications,
- entire module configuration,
- large dashboards,
- pages with their own left navigation + tabs + nested cards.

### 6. Card rule

Cards are reserved for:

- KPI/summary blocks,
- independent business-object summaries,
- alerts or clearly separated high-value information.

Do not wrap every form section or table in a card. Prefer section title + content + spacing/divider.

### 7. Navigation rule

Primary record navigation and secondary configuration navigation must not look identical.

- Primary record navigation: Semi `Tabs` with `type="line"`.
- Secondary navigation: compact text subnav or segmented navigation with substantially lower visual weight.

Never stack two equally prominent rows of tabs.

### 8. Copy rule

UI copy must use natural Chinese business language. Internal architecture terms, implementation disclaimers, database terminology, and developer warnings do not belong in the business UI.

Examples:

- use `活动设置`, not `活动配置` when the page is business-facing;
- use `参与管理`, not `Participation Records`;
- use `中奖与核销`, not `奖品履约`;
- use `领奖预约`, not `Fulfillment Booking`;
- use `核销记录`, not `Redemption Log`.

### 9. No developer prose in business screens

Do not display text such as:

- `纯前端演示`
- `当前原型`
- `不连接微信/HQ`
- `本地抽奖`
- `不具备生产并发能力`
- `后台职责`
- `不是核销数据`

Put implementation limitations in docs, not normal business pages.

### 10. Density rule

Enterprise admin UI should be compact, readable, and information-dense without becoming cramped.

Do not create large white deserts around a small amount of information. Use bounded content widths and meaningful grouping.

### 11. Action hierarchy

Each page or modal should normally have one primary action.

Use:

- Primary: main next action;
- Secondary: common supportive action;
- Text/Ghost/More: low-frequency actions;
- Danger: destructive action only.

Do not render five equal-weight buttons in a row.

### 12. Task-specific QA

Do not invent new screenshot gates, browser test suites, visual regression systems, or acceptance rituals unless the task explicitly asks for them. Follow the task's own testing requirements.

## Completion check

Before finishing any UI task, verify the implementation against `ANTI_PATTERNS.md`. If an anti-pattern appears, fix the structure rather than polishing the wrong structure.
