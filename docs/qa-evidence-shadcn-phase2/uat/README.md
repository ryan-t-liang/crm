# UAT release evidence

Deployed code: `cd95decd6e69a2d2a79dbf69e8db8ca40cfb88df`.
Entry: https://www.gridworks.cn/crm_kivisense/#dashboard
Time: 2026-09-07 12:38 Asia/Shanghai.

- `results.json`: 27 real Chrome checks across SUPER_ADMIN, SALES and VIEWER; permitted core navigation stays in React, shell persists, details survive refresh, and VIEWER mutations are hidden. No unexpected console/network errors or business writes. Expected pre-login `/auth/me` 401s are recorded separately.
- `artifact-parity.json`: 10 root/legacy/build files with identical local, container and HTTPS SHA-256 values; health ready/database ok.
- `backup-SHA256SUMS.txt`: verified app/database/attachment/Nginx backup hashes. Sensitive archives remain on the server, not in GitHub.
- `business-counts-before.tsv` / `business-counts-after.tsv`: identical domain row counts, including migration count. No UAT migration, seed or reset.
- `production-test-before.txt` / `production-test-after.txt`: identical image IDs and start times. Neither Production nor the separate test backend was restarted.

Backup directory: `/srv/kivisense-crm-backups/20260907T043400Z-pre-cd95decd6e69`.
Nginx archive comparison passed; existing duplicate server-name warning is unchanged. Attachment tree contents match the backup; only tracked `.gitkeep` mtimes changed from source extraction. Prior image `kivisense-crm-uat:e832b98c7f9e` is retained.

Browser verification uses existing UAT users and records only safe read-only screens. Credentials are read into process memory from the server and never written to screenshots, logs, repository or browser storage-state files. Mutation flow coverage is in the isolated local evidence, not performed against live business records.

Screenshots are named by role and route; `organizations-detail`, `contacts-detail`, `leads-detail` are the existing UAT records opened as SUPER_ADMIN. Their current names/data are not newly seeded fixtures. The implementation code SHA stays fixed while documentation and test-harness refinements are committed separately.
