# Archive display update plan

**Accepted scope:** One optional institution field, slash-separated multiple/bilingual units, all matching reports visible, YYYY-MM groups within Beijing-time status sections, no campus-only location, and PDF/PDF I/PDF II attachment labels. Preserve report IDs, dates, title, abstract, files and announcement URLs.

**Implementation:** A shared institution normalizer is used by the browser, server validation and data migration. `affiliation` becomes the canonical field; the editor and serializer remove the obsolete language-specific fields. Legacy records remain readable. The person field occupies one grid column and the institution field two columns; date/start/end retain three columns. Preserve meaningful Chinese parenthetical text and English institution names containing “and”; migrate the known two-institution Corvinus/Rényi value explicitly.

- [ ] Write failing institution, legacy-edit/save, full-list/month-group, venue visibility and PDF label tests. Run `node --test tests/frontend.test.mjs tests/backend.test.mjs`.
- [ ] Implement shared affiliation normalization, editor/API canonical field handling, all-report month grouping, venue visibility and PDF Roman numerals. Update affected browser test expectations. Run all Node tests and build with the bundled Node runtime.
- [ ] Snapshot current destination GitHub data. Normalize institution fields in all records, preserve campus-only source data while hiding it publicly, and update import audit/docs. Compare all other report fields and all attachment paths/bytes exactly.
- [ ] Use the browser to verify all reports, filters, two-PDF labels, hidden venue and the single institution editor on desktop and mobile/tablet. Save screenshots outside published code.
- [ ] Publish only selected changed paths to the existing new-account repository through a non-forced ref update against the fresh parent. Wait for matching Netlify deployment; verify GitHub/production data and repeat the public/editor UI checks.
