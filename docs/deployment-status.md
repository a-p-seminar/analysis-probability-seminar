# Deployment status

Checked on 2026-10-06. All services read `a-p-seminar/analysis-probability-seminar`, branch `main`.

| Provider | Status | Public website | Administration |
| --- | --- | --- | --- |
| Render | Live, Free, Singapore | https://ap-whucc.onrender.com/ | https://ap-whucc.onrender.com/admin.html |
| Vercel | Code ready; account registration/login pending | Not created yet | Not created yet |
| Netlify | Existing project retained; builds stopped | https://s-ap.netlify.app/ | https://s-ap.netlify.app/admin.html |

Render's first deployment completed successfully on commit `178780b21d7a1940dc9819879b9121afe960ae11`. Homepage, admin, viewer and health endpoint returned HTTP 200. Public and authenticated report data matched the GitHub baseline: 91 reports and 30 referenced PDFs. Login, logout, temporary upload start/cancel, PDF byte-range streaming, and protection of private paths passed. No report or published attachment was created by these checks.

Netlify `stop_builds` was confirmed `true`; no Netlify deployment was requested. GitHub checks remain manual only.

Removed 11 retired or unreferenced files, including the Cloudflare implementation, original unused background assets and the unreferenced test PDF. The 91 report records and all 30 referenced attachment Git blob hashes remained unchanged. Local cleanup copies are saved under the ignored `.local-data/multi-hosting-2026-10-06/cleanup-backup/` directory.

Render Free sleeps with inactivity. Its password and private sessions are independent of the other providers. Vercel still requires account access and a Free Redis database before its backend can be deployed and verified.
