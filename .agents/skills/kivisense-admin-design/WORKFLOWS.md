# Kivisense Admin Design — Workflows

## Workflow 1 — Before coding a new admin page

1. Identify the business object.
2. Decide whether this is list, create, detail, configuration, or related-data work.
3. Select the matching pattern from `PATTERNS.md`.
4. Inspect the established Lead / Deal / Customer / Member screen and reuse its Kivisense/Semi components, classes and tokens as the final visual baseline.
5. Define visible fields and actions based on the operator's decision needs.
6. Check `ANTI_PATTERNS.md`.
7. Only then implement styling.

If the task does not fit a pattern, do not invent one immediately. First determine whether two existing patterns can be composed without creating duplicate navigation or nested application shells.

## Workflow 2 — Create a business record

Default:

1. List page primary action `新建...`.
2. Open the right-side Quick Create SideSheet using the shared CRM form surface.
3. Capture only the core fields required to create a valid record.
4. Submit.
5. Navigate/open the new record detail page.
6. Let the user configure optional/advanced modules there.

Do not add downstream business modules into the create SideSheet simply because the record may use them later.

## Workflow 3 — Edit core record information

1. Reuse the Quick Create form structure.
2. Pre-fill current values.
3. Title becomes `编辑...`.
4. Footer becomes `取消` + `保存`.
5. Do not mix unrelated advanced settings into the edit form.

## Workflow 4 — Configure advanced behavior

Use the record detail page.

For each advanced domain:

- show a compact summary;
- provide one focused edit action;
- edit in-page for simple settings or use a focused right-side SideSheet for complex settings;
- keep unrelated domains separate.

Examples:

- booking rules;
- draw rules;
- prize configuration;
- role permissions;
- integration settings.

## Workflow 5 — Add a related child object

Examples: session, prize, task, address, note.

Use a focused right-side SideSheet for all related-object new/edit forms. Reserve Modals for confirmations.

Do not launch a full-record wizard.

## Workflow 6 — Record detail information architecture

1. Compact identity header.
2. Existing App Sidebar + Top Header + Page Header + main Card, with an optional business information rail using the shared CRM detail grid.
3. Put 3–5 major line tabs inside the main Card and reuse `record-tabs` styling.
4. Each major tab maps to a business mental model.
5. Use lighter text / small-underline secondary subnav only when necessary.
6. Keep configuration and operational records separate; do not change their models or routes for a visual-only task.

## Workflow 7 — Destructive operation

1. Keep the action low emphasis until invoked.
2. Show a short confirmation.
3. Explain actual consequence only.
4. Use a danger primary button in the confirmation.
5. Do not surface architecture or prototype disclaimers.

## Workflow 8 — Existing UI feels wrong

Do not immediately adjust spacing.

Audit in this order:

0. Identify the mature CRM visual baseline. For a style-only task, keep existing business information architecture and state behavior.
1. Is the interaction pattern wrong?
2. Is the information architecture wrong?
3. Is navigation duplicated?
4. Are Cards fragmented or meaningless, or have useful CRM Card boundaries / the information rail been removed?
5. Is content width wrong?
6. Are actions poorly prioritized?
7. Then adjust spacing, typography, borders, and color.

## Workflow 9 — External reference usage

When referencing Plane/Frappe/Twenty/etc.:

1. Identify the interaction principle.
2. Re-implement with Semi Design.
3. Keep Kivisense copy and visual identity; mature local CRM screens determine the final appearance, not the external product.
4. Do not paste AGPL application code into Kivisense.
5. If considering source reuse, verify the exact file/package license first.
