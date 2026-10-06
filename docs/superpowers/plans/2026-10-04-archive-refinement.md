# Archive refinement

User-provided design: brighten the page, replace the ellipse emblem with colourful fractal artwork, move the seminar/organizer block to the top, remove statistics and source/import copy, and present each report as title → speaker/affiliation → date/time/location → collapsed full abstract. Preserve all five original records and the two PDF files. The user confirmed the alternate speaker/date are layout examples only.

- [x] Inspect the running preview and existing rendering, styles and tests.
- [x] Reproduce missing disclosure/order behavior with two failing rendering tests.
- [x] Implement native accessible details/summary and retain full abstract data and valid attachment controls.
- [x] Move introduction/organizers above the archive, draw a scalable Sierpinski fractal, and add public-page styles with a white background.
- [x] Build and test browser disclosure, layout order, mobile fit, PDF and administrator workflows. Production build, all 34 unit/integration tests, and all four browser workflows pass.
- [x] Inspect desktop/mobile screenshots, confirm no data or attachment changes, refresh the current browser, and prepare this frontend revision for publication.

Schedule display also removes a duplicate date prefix from imported time fields only when it matches the record date. The original imported fields are unchanged.
