# Year-based attachment storage implementation plan

**Goal:** Store attachments directly under their report year, named `YYMMDD_speaker_firstTitleWord_attachmentId.ext`, and retain only each report's WHU/CCNU announcement links.

**Architecture:** The upload service generates an attachment UUID, derives the canonical basename with the shared naming helper, and stores `attachments/<report year>/<basename>`. The browser sends report date, speaker and title with the original filename and displays the canonical name returned by the service. Existing bytes and attachment IDs remain unchanged during migration. School announcement provenance stays in the audit snapshots; displayed links exclude archival and file URLs and known mismatched announcements.

**Tech stack:** Node.js, React, Netlify Functions, GitHub Git Database API.

The user's explicit filename, year-directory and link instructions define the accepted design. Chinese titles without whitespace remain one title token. Preserve the 2024-12-27 dates for Zhang Qian and Ma Caiyun.

- [ ] Update `tests/attachment-name.test.mjs` to assert first title token, preserved ID, Unicode filename bounds and unchanged uploaded bytes. Update upload integration tests in `tests/backend.test.mjs` to assert report-year flat paths and independent repeated uploads. Run the tests and observe the old full-title/nested-directory behavior fail.
- [ ] Update `shared/attachment-name.mjs`, `server/uploads.mjs`, `server/api.mjs`, `src/upload.mjs`, and `src/admin.jsx`. Require valid report metadata for upload initialization. Run `node --test tests/*.test.mjs` and `npm run build`.
- [ ] Fetch the destination's current Git tree and content. Back them up under ignored `.local-data/flat-attachments-2026-10-06/`. Stage all referenced attachments with the new shared filename rule, reusing their exact Git blob hashes. Update paths/names in content and import audit data. Remove obsolete ID directory paths in the prepared Git tree.
- [ ] Filter report `sourceUrls` to the two approved school hosts and announcement paths; apply existing corrected-announcement exclusions. Preserve all other report/site fields exactly, compare all file sizes and hashes, and update README/contract/import summary.
- [ ] Verify a local isolated upload through the real admin UI. Publish an atomic commit to the new destination repository with a non-forced branch update only if its parent still matches the fresh snapshot. Wait for the matching Netlify code deployment.
- [ ] Verify GitHub and production content, report counts/dates/links, all flattened file paths and downloaded file hashes. Confirm a renamed PDF opens through the website, and save a screenshot of the actual GitHub year directory.
