# Kivisense CRM prototype QA issue record

## Open limitations

| ID | Severity | Limitation | Impact |
| --- | --- | --- | --- |
| PROTO-001 | P2 | Browser Object URLs are session-scoped. Attachment metadata persists in LocalStorage, but a preview URL may expire after a full browser restart. | Upload, download, delete, and same-session preview work; this is an intentional frontend-only boundary. |
| PROTO-002 | P3 | Email formatting uses a lightweight rich-text toolbar that inserts bold, italic, list, and link markup rather than a full WYSIWYG document model. | The compose/thread flow is complete, but advanced formatting and rendered markup are outside the current prototype. |

## Resolved during this pass

| ID | Severity | Finding | Resolution and retest |
| --- | --- | --- | --- |
| PROTO-R01 | P1 | The browser requested a missing favicon and emitted a console error. | Reused the Kivisense logo as the favicon; final browser run has 0 console errors and 0 failed requests. |
| PROTO-R02 | P1 | A Demo User selection could be followed by navigation before LocalStorage had persisted the role. | Product behavior was verified to persist; the QA harness now waits for the stored identity before navigation. |
| PROTO-R03 | P2 | Dashboard chart captures could occur during Recharts animation at the smallest viewport. | Evidence capture waits for chart animation; 1024, 1440, 1600, and 1920 screenshots show final chart state. |
| PROTO-R04 | P2 | Contact/Organization attachments, note editing, Product editing, call contact/time, and task-completion Activity were incomplete. | Added the missing interactions and reran the full browser suite to PASS. |
| PROTO-R05 | P2 | Opening the email composer could trigger a hidden `ResizeObserver` loop warning from its autosizing text area. | Replaced autosizing with a stable eight-row editor, added capture for handled window errors, and reran the full suite with no console, window, request, or server errors. |
