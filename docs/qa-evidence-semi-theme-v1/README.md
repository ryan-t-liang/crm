# Kivisense CRM Semi Theme V1 visual evidence

This directory contains the AFTER evidence for the Semi Theme V1 color consolidation.

- Baseline: commit `6b29674e74e1b77ddb8a63e2df069891f92e29ef`
- Runtime: current local production build, served through a local read-only proxy to the existing UAT APIs
- Viewports: `1440x900` and `1280x800`
- Routes: Dashboard, Workbench, Organization list/detail, Contact list/detail, Marketing Lead list/detail, Opportunity list/detail
- Result: `20/20 PASS`
- Browser signals: zero document-level horizontal overflow, console errors, console warnings, page errors, HTTP failures, and request failures
- Business writes: none; authentication only

The machine-readable route measurements and build fingerprints are in `runtime-audit.json`.

The BEFORE comparison set is `docs/qa-evidence-semi-redesign-final/`.
