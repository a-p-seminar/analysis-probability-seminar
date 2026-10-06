# Cloudflare migration implementation plan

**Goal:** Deploy the existing public archive and administrator application to a new Cloudflare project, retaining the existing GitHub repository as the authoritative content and attachment store.

**Architecture:** One Cloudflare Worker serves the Vite static assets and forwards `/api/*` to its private SQLite Durable Object. The Durable Object runs the existing Request/Response API with a transactional private-store adapter. A Cloudflare password source reads the live plaintext `ADMIN_PASSWORD` binding and synchronizes administrator changes through the Cloudflare API. No existing account project is replaced or deleted.

**Tech stack:** React/Vite, Wrangler, Workers static assets, SQLite Durable Objects, Node compatibility, GitHub REST API.

## Scope and decisions

- Preserve all report fields, IDs, dates, PDF bytes, filenames, and year directories.
- Use a new Worker name after checking availability. Connect only `a-p-seminar/analysis-probability-seminar` for automatic GitHub builds.
- Retain the nonblank password policy and current initial password; keep passwords/tokens out of GitHub and static assets.
- Keep secrets and unrelated bindings when changing the password, using `inherit` bindings. Use the script modification revision to revoke older sessions.
- Use 512 KiB staging chunks within SQLite limits. Assemble into one destination buffer and stream base64 to GitHub to stay within Worker memory limits for a 50 MiB attachment.
- Retain signed HttpOnly/Secure/SameSite cookies, CSRF checks, persistent rate limits, conditional writes, and optimistic content revisions.
- Serialize the singleton's API requests so large assemblies and password derivations cannot overlap past the memory limit. Enumerate keys in pages of 16 with no storage caching. Explicitly map the homepage to `index.html`.
- Keep Netlify available until Cloudflare public and administrator checks succeed. Migration does not guarantee WeChat restores access.

## Tasks

- [x] Inspect current deployment adapters, archive counts, Cloudflare documentation and account login.
- [x] Add failing tests for the Cloudflare storage/source adapters and bounded upload behavior.
- [x] Implement the adapters, Worker routing and deployment configuration.
- [x] Run the existing unit suite, Vite build, Wrangler validation and actual workerd login/upload checks. 84 unit tests pass; three simultaneous 50 MiB completion requests serialize and preserve bytes.
- [ ] Prepare a narrowly scoped GitHub change from the latest remote main; verify content and all attachment blob hashes are unchanged.
- [ ] Configure the new project and GitHub integration. Obtain confirmation at any new access grant, then set backend secrets privately.
- [ ] Deploy and verify public data, login/session/logout, settings, upload staging and PDF viewing. Save evidence without secrets.
- [ ] Record the new URLs and exact results in the deployment report.

## Verification commands

`node --test tests/cloudflare.test.mjs tests/backend-github.test.mjs tests/backend.test.mjs`

`node --test tests/*.test.mjs`

`node node_modules/vite/bin/vite.js build`

`node node_modules/wrangler/bin/wrangler.js deploy --dry-run`

Use actual local workerd storage to check persistence, signed sessions and upload assembly; use an injected GitHub service so test files do not enter production content. Validate 50 MiB upload completion and matching SHA-256 at this boundary. Production verification must compare all report content and every attachment blob SHA against the pre-migration GitHub snapshot.
