# Vercel deployment

Import `a-p-seminar/analysis-probability-seminar` as a new Hobby project. Use
Vite, Node 24, branch `main`, and the configuration in `vercel.json`.
`api/seminar.mjs` runs the backend; the frontend, admin and PDF viewer are
served from `dist`. Rewrites preserve the existing `/api/*` interface.

Create a separate Free Upstash Redis database through Vercel Marketplace and
connect it to this project. It holds only private sessions, rate counters,
locks and unfinished uploads. Report JSON and final PDFs remain in GitHub.
Writes use atomic compare-and-set. Transient records expire after 24 hours;
signed sessions expire after eight hours.

| Production environment variable | Configuration |
| --- | --- |
| `GITHUB_OWNER` | `a-p-seminar` |
| `GITHUB_REPO` | `analysis-probability-seminar` |
| `GITHUB_BRANCH` | `main` |
| `GITHUB_TOKEN` | Repository-scoped Contents read/write token; private. |
| `SESSION_SECRET` | Independent random secret, at least 32 characters. |
| `UPSTASH_REDIS_REST_URL` | HTTPS REST endpoint from the connected database. |
| `UPSTASH_REDIS_REST_TOKEN` | Private database read/write token. |
| `ADMIN_PASSWORD` | Your chosen nonblank password; plain and production-only. Keep its value outside GitHub. |
| `VERCEL_ADMIN_PASSWORD_ENV_ID` | ID of this project's password variable. |
| `VERCEL_ENV_TOKEN` | Private Vercel API token authorized for this project. |
| `VERCEL_TEAM_ID` | Owning team, if applicable. |

Enable system environment variables so `VERCEL_PROJECT_ID` and `VERCEL` are
available. The Redis adapter also accepts `KV_REST_API_URL`/`KV_REST_API_TOKEN`
if supplied by the integration. Never expose secrets through `VITE_` variables.
Do not copy production credentials to preview builds.

Authentication reads only the selected production password via Vercel's API.
Password changes edit only its value and invalidate old sessions. Dashboard
edits take effect without rebuilding. If the variable or private store cannot
be read, administrator access fails closed. Passwords and sessions are
independent between hosting providers.

Uploads retain the existing 50 MiB limit but use 512 KiB requests. PDFs are
read directly from GitHub by the existing viewer, avoiding the function
response-size limit. Report updates skip builds through the ignore command.
Free Redis and Hobby quotas apply; no paid upgrade is configured.

References: [Node runtime](https://vercel.com/docs/functions/runtimes/node-js),
[Vite](https://vercel.com/docs/frameworks/frontend/vite),
[Marketplace storage](https://vercel.com/docs/marketplace-storage),
[Upstash integration](https://upstash.com/docs/redis/howto/vercelintegration),
[Environment API](https://vercel.com/docs/rest-api/projects/edit-an-environment-variable).
