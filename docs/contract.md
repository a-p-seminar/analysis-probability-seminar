# Seminar application contract

Current delivery scope (user correction): preview with only five selected real records and two PDFs. Do not publish the complete import. Full snapshots, importer and original data remain under ignored `.local-data/full-import/`. Keep the full frontend/backend requirements below; only the initial content volume is reduced.

User-approved scope: independent frontend and Netlify Functions backend; complete historical records from the two listed sources; year grouping and month filtering; all matching records displayed together, with each complete abstract in a disclosure closed by default; no Excel import. A PPT entry appears only when a valid uploaded PDF/PPT/PPTX exists. PDFs open in an integrated PDF.js viewer with thumbnails. Original PowerPoint files are downloadable. Content and attachment commits must not rebuild the website.

Latest frontend revision: white background, a 2:1 masthead with “Seminar on Analysis and Probability” above “武汉大学-华中师范大学联合分析与概率讨论班” at the same smaller font size, left-aligned in the left column, with organizers underneath. Open teal-to-lilac artistic fractal curves occupy the independent right column, spanning both text rows on desktop. On mobile the organizer row spans the full width. The fractal opens the password-protected administrator page in a separate tab. Remove the public navigation, About block, archive title/refresh button and year sidebar; a sticky search bar contains year/month dropdowns. Each report is a pale-blue bordered card with a teal-blue title. Its first valid source URL is the meeting destination, opened in a new tab by the title or card background; abstract disclosures and attachment links act independently. Empty or invalid URLs create no placeholder link. Records display with title, speaker/bold affiliation, full date/time/location, and click-to-expand abstract. Remove the statistics strip, explanatory copy, back-to-top link, public source links and import notices. Keep original report data, source URLs and notes in storage: the user's alternate speaker/date were explicitly confirmed as formatting examples only. The latest requested data change prefixes each venue with “武大·” or “华师·”; report titles, speakers, dates, abstracts and attachments remain unchanged.

The administrator page shares the white/blue palette. It combines keyword, year, month and inclusive date-range filters without losing the current draft. The editor provides a 武大/华师 school selector beside the venue field, hides the notes field, and labels its final sections “链接” and “附件上传”.

Sources:
- https://perso.math.u-pem.fr/liao.lingmin/SAP-WH.html
- https://github.com/a-p-seminar/Seminar-of-Analysis-and-Probability

## Data format

`content/seminars.json` is UTF-8 JSON:

```json
{"schemaVersion":1,"site":{"title":"分析与概率讨论班","titleEn":"Seminar of Analysis and Probability","subtitle":"武汉大学 · 华中师范大学","organizers":[{"name":"范爱华","nameEn":"Ai-Hua FAN","email":"ai-hua.fan@u-picardie.fr"}],"sources":["https://perso.math.u-pem.fr/liao.lingmin/SAP-WH.html","https://github.com/a-p-seminar/Seminar-of-Analysis-and-Probability"]},"talks":[{"id":"2026-08-05-jiang-lai","date":"2026-08-05","time":"","speaker":"蒋赉","affiliation":"国科大杭州高等研究院","title":"Representations of rational numbers and Minkowski dimension","abstract":"","location":"","notes":"","sourceUrls":[],"attachments":[{"id":"example","name":"example.pdf","type":"pdf","path":"attachments/2026/example.pdf","size":100,"url":""}]}]}
```

Dates are exact ISO calendar dates. Never infer missing source facts. Empty optional fields are omitted visually. `notes` records ambiguities or source-specific metadata. Abstracts use plain text, original TeX preserved; never render source HTML unsanitized. `sourceUrls` contain validated http(s) URLs; the first URL is the public card destination and should be the individual meeting page. IDs are stable unique URL-safe identifiers. Attachment `path` is under `attachments/`, `url` is a validated external original URL only when not copied. API resolves owned paths to raw GitHub URLs in responses (or local `/attachments/...` in local mode). Empty / # attachment links are excluded. Content persisted to GitHub should retain relative paths to remain portable. The admin must preserve unknown optional properties and site metadata when saving.

## API (same-origin /api)

All errors return JSON `{error: string}` with a meaningful status. Mutations require a valid HttpOnly session cookie and same-origin Origin validation; requests from other sites are rejected. Tokens never enter frontend code. A generated strong administrator password is configured through a scrypt hash, with rate limiting. Development defaults to local filesystem storage; production never falls back to local files for writes.

- `GET /api/content` -> `{content, revision}` public runtime fetch, short cache. Returns full data with attachment URLs resolved.
- `GET /api/session` -> `{authenticated: boolean, mode: "local"|"github"}`.
- `POST /api/login` JSON `{password}` -> `{authenticated:true}` and signed HttpOnly cookie.
- `POST /api/logout` -> `{authenticated:false}` and expired cookie.
- `POST /api/admin/password` JSON `{currentPassword, newPassword}` -> `{authenticated:false, passwordChanged:true}` and expired cookie. Verify current password, require a different 12–128 character new password, and atomically update the scrypt hash plus credential version in private storage (`auth/admin-password`). Every earlier session is rejected immediately on its next request. `ADMIN_PASSWORD_HASH` is used only before a private credential exists; password changes never rewrite environment variables or the GitHub repository. Concurrent updates return 409; guessing is rate limited separately from login.
- `GET /api/admin/content` -> `{content, revision}`; content contains portable attachment paths, not derived URLs.
- `PUT /api/admin/content` JSON `{content, revision}` -> `{content, revision}`. Validate entire document, require optimistic revision match, return 409 instead of overwriting concurrent edits. Git commit includes `[skip netlify]`.
- `POST /api/admin/uploads` JSON `{name, size}` -> `{id, chunkSize}`. Allow PDF/PPT/PPTX only, max 50 MiB. Return chunk size 2 MiB (below Netlify request limit).
- `PUT /api/admin/uploads/:id/:index` application/octet-stream body -> `{ok:true}`. Require exact chunk sizes, indices, ownership and unexpired session.
- `POST /api/admin/uploads/:id/complete` -> `{attachment}`. Check complete byte count and magic bytes; create file under `attachments/{year}/{uuid}-{safeFilename}`, commit `[skip netlify]`, then return portable attachment object. Chunk staging uses private Netlify Blobs in production and local disk in development. Clean staged chunks after completion; expiry and cleanup for abandoned uploads. File upload does not add an attachment to a talk until the administrator saves that record.
- `DELETE /api/admin/uploads/:id` -> `{ok:true}`, cancel and remove staged chunks.

Admin edits title, speaker, affiliation, date, time, location, full abstract, notes and source URLs; can create and delete talks and add/remove attachment references. Save updates public runtime data without a deploy. Show upload progress and unsaved state; errors keep form data intact. Only one data save at a time. On 409 preserve edits and explain refresh conflict.

## Implementation boundaries

- Frontend worker owns `src/`, `index.html`, `admin.html`, `viewer.html`, `tests/frontend.test.mjs` only. Vite multi-page React JS, CSS, local PDF.js worker and KaTeX optional. Entry /, /admin.html, /viewer.html. Viewer query `file` is validated http(s) or same-origin /attachments path, with file name query `name`. Do not import /content JSON at build time.
- Data worker owns `content/`, `attachments/`, `sources/`, `scripts/import-sources.py`, `tests/data.test.mjs` only. Fetch both sources, include full fields, resolve/deduplicate records and copy actual linked files where accessible; keep provenance and source snapshots. Produce `sources/import-report.json` with counts, deduplication rationale, source omissions, inaccessible links. Do not fabricate abstracts or files. Tests assert all source records mapped, dates/IDs valid, actual files match metadata and no placeholder attachment URL.
- Backend worker owns `server/`, `netlify/functions/`, `tests/backend*.test.mjs` only. Export `createApi({repository, store, env})` from `server/api.mjs`, `createLocalRepository(root)` from `server/local-repository.mjs`, `createLocalStore(root)` from `server/local-store.mjs`. Request -> Response API. Export `hashPassword(password)` from `server/auth.mjs` (scrypt), read ADMIN_PASSWORD_HASH and SESSION_SECRET. GitHub production env `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` default main, `GITHUB_TOKEN`. API wrapper supports Netlify Request handlers. Production store @netlify/blobs; repository GitHub Git Database + Contents APIs. Backend tests use real temporary disk data, auth, concurrency, chunk assembly and injected HTTP only at GitHub boundary. Network credentials must never be logged.
- Parent owns package/build scripts, local dev server adapter, tests/integration and deployment docs, GitHub repository setup, browser verification and final review.

Node >=22. Dependencies: React/react-dom, Vite, pdfjs-dist, katex, @netlify/blobs. Tests: Node built-in node:test; browser acceptance via Playwright. Never commit .env, cookies, credentials, generated admin password, node_modules or dist.
