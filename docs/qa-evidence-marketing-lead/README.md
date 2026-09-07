# Marketing Lead browser evidence

`local/results.json` is the machine-readable result for the local browser run. The run used the real built application, a disposable MySQL database, a 1440×1000 primary viewport, and responsive checks at 1280×1000 and 1024×1000.

The numbered files map directly to the requested review states:

1. management overview;
2. marketing funnel;
3. nurture and scoring;
4. Marketing Lead list;
5. Qualified Marketing Lead detail;
6. activity entry;
7. score breakdown;
8. MQL;
9. SQL;
10. conversion dialog;
11. existing company match;
12. existing contact match;
13. converted Marketing Lead;
14. opportunity list;
15. opportunity source block;
16. company journey;
17. scoring rules.

Files numbered 18–20 repeat core pages at 1280 and 1024 widths. Every capture records body/document/viewport width and fails the run on page-level horizontal overflow.

Run locally with:

```bash
QA_BASE_URL=http://127.0.0.1:3300 QA_PASSWORD='<local-admin-password>' node scripts/marketing-lead-browser-qa.mjs
```

The script is intentionally restricted to localhost and creates QA-only Marketing Lead fixtures in the selected local database.

## Deployed UAT evidence

`uat/artifact-parity.json` proves that the local build, HTTPS response, and running UAT container have matching SHA-256 hashes for all nine release files. Its expected and remote commit are both `7f203799d9526b0ba50486db39913f4a10786f7d`.

`uat/results.json` is the read-only browser review for SUPER_ADMIN, SALES, and VIEWER at 1440 px. All three roles passed their permitted screens with no page overflow, no unexpected network failures, no console failures, and no business writes. The expected unauthenticated `/auth/me` probes are recorded separately from failures.

The remaining UAT files preserve the deployment controls:

- `SHA256SUMS` covers the application, database, attachments, and Nginx backups in `/srv/kivisense-crm-backups/20260907T080926Z-pre-marketing-7f203799d952`;
- `business-counts-*.tsv` proves eight existing business-table counts were unchanged before preflight, after migration, and after activation;
- `production-test-*.txt` proves the protected Production and Test backend container image IDs and start times were unchanged;
- `migration-output.txt` records the second deployment's safe no-op migration result, while `marketing-schema-after.tsv` confirms the Marketing migration and new tables;
- `deployed-health.json` records UAT readiness after activation.

Run the read-only deployed checks with:

```bash
EXPECTED_COMMIT=7f203799d9526b0ba50486db39913f4a10786f7d node scripts/marketing-lead-uat-artifact-check.mjs
node scripts/marketing-lead-uat-readonly-qa.mjs
```
