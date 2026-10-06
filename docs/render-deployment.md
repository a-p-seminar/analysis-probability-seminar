# Render deployment

Create a new Free Node Web Service from `a-p-seminar/analysis-probability-seminar`, branch `main`, using `render.yaml`. The homepage, administration interface, API and attachment proxy run together under the service's `onrender.com` URL. Use Singapore and the build/start commands in the template. Keep this service separate from existing projects.

| Environment variable | Configuration |
| --- | --- |
| `NODE_VERSION` | `24` |
| `GITHUB_OWNER` | `a-p-seminar` |
| `GITHUB_REPO` | `analysis-probability-seminar` |
| `GITHUB_BRANCH` | `main` |
| `GITHUB_TOKEN` | Repository-scoped Contents read/write token; private. |
| `SESSION_SECRET` | Independent random secret, at least 32 characters. |
| `ADMIN_PASSWORD` | Nonblank plaintext password, initially `ap`. |
| `RENDER_ENV_TOKEN` | Private Render API credential for this service's password. |

Render supplies `RENDER_SERVICE_ID`, `RENDER_EXTERNAL_URL`, `RENDER` and `PORT`. Passwords are read from Render's live environment API. Editing `ADMIN_PASSWORD` in the dashboard or in the admin password dialog invalidates old sessions; it does not require a new website build. Credentials stay outside GitHub and frontend assets. Each hosting provider keeps an independent password and session.

Report edits and final attachments go to GitHub. Sessions, counters and unfinished uploads use ephemeral local files. A restart logs users out and interrupts unfinished uploads, while published reports and attachments remain. Build filters exclude report data, attachments, import evidence, documentation and tests, because those changes do not require rebuilding the website.

Render Free services sleep after 15 idle minutes and may take about a minute to wake. An always-on service requires a paid plan; this setup uses Free.

Netlify builds remain stopped. Creating this service does not deploy Netlify.

References: [Web services](https://render.com/docs/web-services), [Free services](https://render.com/docs/free), [Runtime version](https://render.com/docs/node-version).
