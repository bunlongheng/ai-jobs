# /api/jobfill - Chrome extension + board contract

The JobFill MV3 extension is the primary client of the extension-only routes. Base:
`http://127.0.0.1:3017/api/jobfill`. All responses are JSON.

## Guards (who may call what)

- **Extension-only routes** (`originBlocked`): reject any web-page `Origin` (http(s) OR the
  literal `null`) AND any non-loopback Host, so only the extension / local tools on the same
  machine reach them - a LAN device cannot. Optionally pin to your extension id via
  `JOBFILL_EXTENSION_ID`.
- **Board routes** (`crossOriginBlocked`): the board's own client calls these same-origin;
  a cross-origin request is refused (no drive-by CSRF), but no login is required on localhost.

## Extension-only routes (originBlocked: loopback + no web Origin)

| Route | Method | Body | Returns |
|---|---|---|---|
| `/profile` | GET | - | `{ identity, apply_answers }` from profile.json |
| `/kits` | GET | - | kit_ready + planned applications (id, company, title, url) |
| `/kit/[id]/[what]` | GET | - | `what` = `resume` (PDF) or `cover` (text) for a kit |
| `/rules` | GET | - | answer rules the extension merges over its built-ins |
| `/version` | GET | - | current engine/rules version the extension checks against |
| `/command` | POST | `{ action, kitId?, url?, overwrite?[] }` | enqueues a command; `action` = fill\|ping\|reload\|open\|audit\|read\|click\|setfields\|detect_easy_apply |
| `/commands/poll` | GET | - | pending commands (delivered once, extension polls every 5s) |
| `/event` | POST | `{ id, outcome, url?, fields?, debug? }` | logs a fill/submit event; side effects below |

## Board routes (crossOriginBlocked: same-origin only)

| Route | Method | Body | Returns / effect |
|---|---|---|---|
| `/recruiter-status` | POST | `{ firm, flag? \| note? \| meeting? \| badPhone? }` | per-firm call-sheet state (called/emailed/voicemail, spoke-to note, next meeting, dead phone) |
| `/find-email/[id]` | POST | - | Hunter.io lookup of the hiring company's email for a job; writes `found_email` (uses the 50/mo Hunter quota) |
| `/prescan` | POST | - | spawns the headless form-fill pre-run over jobs that still need filling |
| `/readyscan` | POST | - | re-proves the green "Ready" pile (cover PDF + resume + answers); no browser |

The board's `/api/jobs/*` routes (`like`, `applied`, `hold-company`) use the same
`crossOriginBlocked` same-origin guard.

## `/event` outcomes (the state machine)

- `filled` - form filled; `fields` = `[label, value, type, options?][]`. If any value
  starts with `MANUAL`, the row is a RED (pf_status=gaps); zero reds => `ready`.
- `submitted` - flips the application to `applied` + `applied_at`. If `id` is `_meta`,
  the row is matched by `url` (native LinkedIn/Indeed Easy Apply).
- `easy_apply_detected` - stamps `easy_apply` (1/0) + `easy_apply_checked=1`, matched by `url`.
- `command_result` - result of a queued command (app_id `_channel`).
