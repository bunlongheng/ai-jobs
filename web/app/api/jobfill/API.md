# /api/jobfill - Chrome extension contract

The JobFill MV3 extension is the only client of these routes. All are same-origin
JSON; browser pages are rejected (`originBlocked`). Base: `http://127.0.0.1:3017/api/jobfill`.

## Routes

| Route | Method | Body | Returns |
|---|---|---|---|
| `/profile` | GET | - | `{ identity, apply_answers }` from profile.json |
| `/kits` | GET | - | kit_ready + planned applications (id, company, title, url) |
| `/kit/[id]/[what]` | GET | - | `what` = `resume` (PDF) or `cover` (text) for a kit |
| `/rules` | GET | - | answer rules the extension merges over its built-ins |
| `/command` | POST | `{ action, kitId?, url?, overwrite?[] }` | enqueues a command; `action` = fill\|ping\|reload\|open\|audit\|read\|click\|setfields\|detect_easy_apply |
| `/commands/poll` | GET | - | pending commands (delivered once, extension polls every 5s) |
| `/event` | POST | `{ id, outcome, url?, fields?, debug? }` | logs a fill/submit event; side effects below |

## `/event` outcomes (the state machine)

- `filled` - form filled; `fields` = `[label, value, type, options?][]`. If any value
  starts with `MANUAL`, the row is a RED (pf_status=gaps); zero reds => `ready`.
- `submitted` - flips the application to `applied` + `applied_at`. If `id` is `_meta`,
  the row is matched by `url` (native LinkedIn/Indeed Easy Apply).
- `easy_apply_detected` - stamps `easy_apply` (1/0) + `easy_apply_checked=1`, matched by `url`.
- `command_result` - result of a queued command (app_id `_channel`).

## Notes

- Requests carrying an http(s) `Origin` get 403 - only the extension + local tools talk here.
- The board's `/api/jobs/*` routes (like/applied) are separate and browser-callable
  (same-origin, no origin guard) since the board's own client calls them.
