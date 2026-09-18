# Kivisense Admin Design — Reference Findings

This document records the external design findings that informed the skill. It is not a requirement to visually clone any product.

## Plane

Observed principle:

- quick-create work items open in a creation modal;
- the product favors reduced visual noise and object-first workflows;
- creation does not require a full configuration wizard.

Use for:

- interaction density;
- quick-create mental model;
- clean navigation and action hierarchy.

License note:

Plane application source is AGPL-3.0-only. Do not copy application source into Kivisense.

## Frappe CRM

Observed principle:

- Lead/Deal list uses `Create` to open a Quick Entry modal;
- Quick Entry is intentionally customizable so only necessary fields are captured first;
- a form dialog collects data without becoming a full application shell;
- deeper record information lives on record pages.

Use for:

- Quick Create Modal;
- minimal required fields;
- record-first CRM workflows.

License note:

Frappe CRM is AGPLv3. Re-implement interaction patterns; do not paste application source into Kivisense.

## Twenty

Observed principle:

- record collections are first-class objects;
- clicking a row can open a right-side quick-inspection panel;
- full record pages use tabs/widgets for deeper work;
- navigation and page layouts are record-centric.

Use for:

- list → side panel → full record page hierarchy;
- record detail information architecture;
- object-first workflows.

License note:

Twenty is mostly AGPLv3, with some files commercially licensed and some packages MIT. The `twenty-ui` component package is identified as MIT in Twenty's license, but Kivisense should still prefer Semi Design unless there is a deliberate dependency decision.

## Semi Design

Observed principle:

- Forms are explicitly supported inside Modal;
- Tabs support line style and are appropriate for switching major content groups;
- Modal, SideSheet, Table, Tabs, Form, Popconfirm, and related components cover Kivisense's standard admin patterns.

Use for:

- actual Kivisense component implementation.
