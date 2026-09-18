# Kivisense Design System V2 — Enterprise Admin UI Contract

## Purpose

Kivisense Design V2 is not a new component library. It is a product-UI contract layered on top of Semi Design.

It standardizes how Kivisense back-office products create records, edit records, display lists, structure record detail pages, organize configuration, present tables, and prioritize actions.

The objective is consistency across CRM, Marketing, Member, Lead, Deal, Dashboard, System Management, and future enterprise modules.

## Core philosophy

### Object first

Create the business object with the minimum valid information, then manage deeper configuration on the object's detail page.

### Record pages, not giant forms

Complex business modules should be modeled as persistent records with related configuration and data, not as one enormous creation flow.

### Less visual noise

Hierarchy comes from typography, spacing, alignment, navigation and meaningful CRM Card boundaries—not from wrapping every two fields or every metric in a separate Card. Forms are allowed in one main information Card.

### Existing CRM visual authority

The mature Lead Detail, Deal Detail and Customer / Member Detail screens determine the final visual language. Reuse their AppShell, page background, Cards, border/radius tokens, typography, Tabs, Table, Form and Modal / Drawer treatment. Do not change Sales / Member to match an isolated Marketing style or adjust global tokens for a module.

### Kivisense CRM Record Detail Pattern

`App Sidebar + Top Header + Page Header + Main Card + Optional Right Information Rail`

Reuse `DetailWorkspace`, `SideSection`, `DataList`, `detail-grid` and `record-tabs`. Primary line Tabs live inside the main Card. The information rail uses real identity, relationships and business windows with the existing CRM grid / responsive behavior. No full-width unbounded white page, floating primary Tabs or `后台职责` Card.

Allow one main information Card, compact business Summary Cards and Right Rail Info Cards. Reject fragmented, meaningless and redundant nested Card wrappers; inside settings or a business summary, keep field groups / metrics flat. Related tables reuse `data-surface`, `table-toolbar`, Semi Table and `EmptyBlock` instead of a Marketing-specific table stylesheet.

### Enterprise density

Kivisense should feel calm and premium, but not sparse. Use bounded content widths and compact tables/forms.

### Natural business language

Chinese UI must sound like an operations product, not source code or architecture documentation.

## Canonical interaction map

| Need | Kivisense pattern |
|---|---|
| create normal record | Quick Create SideSheet |
| edit core record fields | same right-side SideSheet pattern |
| inspect a row quickly | Side Panel / Drawer |
| work deeply with a record | Full Record Detail Page |
| edit one complex settings group | Focused SideSheet |
| configure advanced modules | Record Detail → Settings |
| create related child record | compact right-side SideSheet |
| destructive action | compact confirm |
| switch major detail domains | line Tabs |
| switch sub-areas within one domain | lighter subnav |

## Default prohibited patterns

- stepper/wizard for ordinary record creation;
- full-screen create drawer for a small form;
- nested application inside a SideSheet;
- equal-weight primary and secondary tab rows;
- fragmented Card-per-field-group forms and redundant nested Card wrappers;
- large empty canvases around a few fields;
- many equal action buttons;
- implementation disclaimers in business UI;
- internal English/architecture jargon translated literally into Chinese.

## Implementation baseline

Use Semi Design components and existing Kivisense theme tokens. Extend styling only where needed to enforce Kivisense spacing, density, content width, and hierarchy.

Existing `app.css` / `components.css` spacing and typography take precedence over generic new-page recommendations. Keep record fields around 12–20px apart and information Card padding compact (around 16–20px when appropriate); do not repeat 32–48px blank gaps. All create/edit forms use the shared CRM right-side `FormSideSheet`, typically 520–720px wide and capped at the viewport, with cancel/save in `sheet-footer` and a scrollable body. Modals remain for confirmations only. Use quick-create core fields and a compact 160–200px rich-text editor rather than a wizard or CMS-sized form.

Do not replace Semi Design with another component library for isolated screens.

## Source references

Plane, Frappe CRM, Twenty and other external references inform creation, object models, navigation and interaction only. Mature Kivisense CRM screens determine the final visual language. Do not clone an external visual brand, override local CRM identity to resemble Plane, or copy AGPL application source.
