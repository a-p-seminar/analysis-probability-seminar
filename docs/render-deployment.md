# Render deployment (canceled)

The user canceled this deployment. The newly created `ap-whucc` service and
project have been deleted. The live frontend and backend remain on Netlify:
https://s-ap.netlify.app/. The instructions below are retained as an unused
deployment template; no Render service is currently running.

This is an additional deployment of the seminar archive. It does not replace
the Cloudflare Worker. Both deployments use the same GitHub archive:
`a-p-seminar/analysis-probability-seminar`, branch `main`.

Create a new Node Web Service named `ap-whucc` in the new Render account.
Use the Free compute plan and the Singapore region. Import `render.yaml`, or
use its build command and start command when creating the service manually.
The frontend, admin UI, APIs and PDF proxy run on the same origin.

Required service environment variables:

| Variable | Purpose |
| --- | --- |
| `NODE_VERSION` | Pin the Node runtime to the version in `render.yaml`. |
| `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` | Locate the shared archive. |
| `GITHUB_TOKEN` | Repository-scoped Contents read/write credential. |
| `SESSION_SECRET` | Independent random secret of at least 32 characters. |
| `ADMIN_PASSWORD` | Current plaintext admin password, kept only in Render. |
| `RENDER_ENV_TOKEN` | Render API key used to read/update this service's password variable. |

Render automatically provides `RENDER_SERVICE_ID`, `RENDER_EXTERNAL_URL`,
`RENDER` and `PORT`. Do not copy Cloudflare or Netlify management credentials
into Render. Do not put credentials in GitHub or frontend build variables.

The admin reads the live Render password variable. Updating it in the Render
dashboard or from the admin password dialog invalidates existing sessions.
Password changes update only this service's `ADMIN_PASSWORD` variable.
The application must fail closed if Render cannot provide the credential.

Report edits and completed PDF/PPT/PPTX uploads are committed to GitHub.
Sessions, rate counters and unfinished uploads use private ephemeral files.
Restarting the service logs users out and interrupts unfinished uploads;
published reports and attachments remain in GitHub. Uploaded files retain the
year-directory and filename format used by the existing deployments.

Free web services sleep after 15 idle minutes and may take about a minute to
wake. This limitation also affects a frontend served by the same web service.
The Singapore deployment is not a guarantee of mainland China connectivity.

Before claiming deployment success, verify `/`, `/admin.html`, `/viewer.html`,
`/healthz`, all archive records and attachment metadata, secure login/session/
logout, one filtered report-list interaction, and a rendered PDF. Compare
archive JSON and PDF blob hashes against the existing GitHub revision.

References: [Render Web Services](https://render.com/docs/web-services),
[Free services](https://render.com/docs/free),
[API](https://render.com/docs/api).
