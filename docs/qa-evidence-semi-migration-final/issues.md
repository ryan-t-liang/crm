# Semi Design migration final issue record

## Functional Issues

No open functional defect was identified in the 22 read-only route/view combinations covered by this audit.

The unauthenticated login checks each produced one `GET /api/v1/auth/me` response with status 401 and the browser's corresponding resource-console message. This is the expected session probe that causes the application to render the login page. It is classified as expected behavior, not a defect.

Interaction coverage remains deliberately limited: login submission, create/edit forms, validation, imports/exports, uploads, mutations, persistence, and RBAC-denied states were not exercised and should not be inferred from this result.

## Design Consistency Issues

No open design-consistency defect was identified in the captured states. Manual review found no overlap, incoherent clipping, document overflow, unreadable control, broken responsive composition, or page that fell outside the shared Kivisense/Semi product language.

Wide core list tables at 1024px intentionally use a contained table scroll area and a fixed action column. Some non-primary fields are beyond the initial horizontal position, but the page itself remains within the viewport and the primary identity and action remain available. This is an acceptance note, not a defect.

The final accessibility probe checked all 16 visible Semi Select/combobox controls in the 22 captured cases. Every control had a resolvable accessible name; no unnamed combobox remains open.

### Fixed during final review

#### `SEMI-FINAL-DEFECT-001` - Supplier empty state used the organization label

- Severity: S3 Medium
- Affected module: Supplier list empty state
- Environment: local production build at `http://127.0.0.1:3000`, 1440x900 and 1024x768
- Source: `frontend-react/src/pages/organizations-page.tsx`
- Steps: open `#suppliers` with a dataset containing no supplier organizations
- Expected: the empty-state title is `暂无供应商`
- Pre-fix actual: the empty-state title was `暂无组织`
- Resolution: the title now branches on supplier mode and renders `暂无供应商`
- Retest evidence: [Supplier 1440x900](11-suppliers-1440x900.png), [Supplier 1024x768](12-suppliers-1024x768.png)
- Retest status: **PASS / CLOSED** in build `971bde2a42733e3237a3d378f8e15ff2b4e0b10fa75316a9e2d716215959e006`

### Prior finding corrections

| Prior finding | Current status | Retest evidence | Resolution |
| --- | --- | --- | --- |
| `VIS-001` - Dashboard composition is visually collapsed | Corrected | [Dashboard 1024x768](01-dashboard-1024x768.png) | Trend, KPI, chart, team, selector, and funnel surfaces render as bounded, readable regions. |
| `VIS-002` - Contact relationship table does not use available width | Corrected | [Contact detail 1024x768](06-contact-detail-1024x768.png) | The relationship table fills the right-hand detail workspace and distributes its columns coherently. |
| `VIS-003` - Narrow detail metadata wraps awkwardly | Corrected | [Contact detail 1024x768](06-contact-detail-1024x768.png), [Organization detail 1024x768](04-organization-detail-1024x768.png) | Identity values remain readable without the prior weak email/name fragments. |
| `VIS-004` - `公司`/`组织` terminology conflict | Not applicable | [Organizations list 1024x768](03-organizations-list-1024x768.png), [Organization detail 1024x768](04-organization-detail-1024x768.png) | The approved current product label is `组织`; the earlier expectation was superseded and must not remain an open issue. |

### Retest status

- Severity: no open S1/S2/S3/S4 item in the captured scope.
- Environment: audited production build fingerprinted in [README.md](README.md).
- Automated result: 22 passed, 0 failed, 0 blocked.
- Accessibility result: 16 visible comboboxes checked, 0 unnamed.
- Full event, geometry, and combobox-name evidence: [runtime-audit.json](runtime-audit.json).
- Recommended next test: interaction and RBAC coverage described under the README coverage limits.
