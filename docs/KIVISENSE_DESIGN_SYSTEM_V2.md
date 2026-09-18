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

Hierarchy comes from typography, spacing, alignment, and navigation—not from wrapping every section in a card.

### Enterprise density

Kivisense should feel calm and premium, but not sparse. Use bounded content widths and compact tables/forms.

### Natural business language

Chinese UI must sound like an operations product, not source code or architecture documentation.

## Canonical interaction map

| Need | Kivisense pattern |
|---|---|
| create normal record | Quick Create Modal |
| edit core record fields | same Modal pattern |
| inspect a row quickly | Side Panel / Drawer |
| work deeply with a record | Full Record Detail Page |
| edit one complex settings group | Focused Drawer / Modal |
| configure advanced modules | Record Detail → Settings |
| create related child record | small Modal / focused Drawer |
| destructive action | compact confirm |
| switch major detail domains | line Tabs |
| switch sub-areas within one domain | lighter subnav |

## Default prohibited patterns

- stepper/wizard for ordinary record creation;
- full-screen create drawer for a small form;
- nested application inside a SideSheet;
- equal-weight primary and secondary tab rows;
- card-per-section forms;
- large empty canvases around a few fields;
- many equal action buttons;
- implementation disclaimers in business UI;
- internal English/architecture jargon translated literally into Chinese.

## Implementation baseline

Use Semi Design components and existing Kivisense theme tokens. Extend styling only where needed to enforce Kivisense spacing, density, content width, and hierarchy.

Do not replace Semi Design with another component library for isolated screens.

## Source references

The system's interaction principles were informed by current patterns in Plane, Frappe CRM, Twenty, and Semi Design documentation. These references are used to validate product patterns, not to clone their visual brand or copy AGPL application source.
