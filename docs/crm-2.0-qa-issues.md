# Kivisense CRM 2.0 Field Alignment QA Issues

## Open issues

None after the final local regression pass.

## Functional issues found and retested

| ID | Severity | Title | Environment | Expected | Actual before fix | Fix and retest | Evidence |
|---|---|---|---|---|---|---|---|
| QA-FA-001 | S4 | External attachment displayed `0 B` | Local browser fixture | Unknown external size must not look like a measured zero-byte file | Detail and edit showed `0 B` | `null` size now renders as `大小未知`; PASS | `qa-evidence/06-lead-detail-1440.png` |
| QA-FA-002 | S4 | Synthetic image preview returned an invalid response header | Local browser fixture only | Image attachment preview loads | Chinese fixture filename caused a 500 header error | RFC 5987 filename encoding and a valid PNG fixture response added; natural size verified; PASS | `qa-evidence/06-lead-detail-1440.png` |

## Design consistency issues found and retested

| ID | Severity | Title | Source | Expected | Actual before fix | Fix and retest | Evidence |
|---|---|---|---|---|---|---|---|
| QA-UI-001 | S3 | Lead filters were cramped at 1440 | Existing Kivisense CRM V1 structure and supplied screenshot | Search and select labels remain readable | Six filters compressed the search field | Lead toolbar wraps below 1600 px while preserving V1 controls; PASS at 1440/1280/1024 | `qa-evidence/05-leads-list-1440.png`, `qa-evidence/09-leads-list-1280.png` |

## Retest recommendation

After every attachment-policy or Nginx upload-limit change, rerun PDF, DOCX, JPG, MP4, spoofed MIME, oversize, IDOR, and storage-cleanup cases. After every field-dictionary change, rerun `npm run test:field-dictionary`, import/export integration, and the three responsive widths.

