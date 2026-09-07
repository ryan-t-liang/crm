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
