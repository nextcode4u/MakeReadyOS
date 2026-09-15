# Pool Reports

PDF and printable HTML share `apps/api/src/lib/poolReport.ts`. Both include all eight stored readings: pH, free/combined/total chlorine, total alkalinity, cyanuric acid, calcium hardness and water temperature. Each entry starts a new page; long findings, notes and attachments can continue onto additional pages rather than being clipped. The chemistry grid uses four columns instead of putting every report field in a single wide row. PDF footers include page numbers.

Each entry also includes the saved assessment and findings, chemical product names and formatted amounts with addition notes, all safety check results and notes, maintenance/water observations, technician notes, attachment names/notes, and record ID/update timestamp. Attachment files are listed, not embedded. Existing property permissions and date filters still apply. Historical assessments are not recalculated against today's targets.

CSV retains its original first 17 columns and adds unit context, maintenance/water observations, safety check results/notes, attachment filenames and record ID. Chemical addition notes now accompany their quantities. Formula-prefix escaping remains enabled.

Missing chemistry is labeled Not recorded in printable reports; a recorded zero stays zero. Legacy boolean observations cannot distinguish false from omitted, so false is labeled Not marked rather than certifying a negative observation. Temperature has no stored unit and is explicitly labeled as recorded; no historical Fahrenheit/Celsius assumption is made.

## Follow-ups

- [ ] Capture a temperature unit for new logs and provide an explicit unit-confirmation path for historical readings. Do not silently reinterpret existing temperatures.
- [ ] Store tri-state maintenance/water observations so unrecorded observations are distinguishable from a confirmed No.

## Verification

2026-09-15 (local, not deployed): API build and isolated production-image browser test passed (`logs/e2e-20260915-151416.txt`). Tests generate and extract text from actual PDFs, verifying all chemistry fields/values, zero readings, pounds/ounces quantities, addition notes, safety details, attachment names, page footers, long-note continuation, missing readings and an empty date range. HTML checks verify escaped user text and no horizontal overflow at Letter printable width. CSV supporting fields are checked. The rendered PDF's first page was visually inspected. PDF extraction requires `poppler-utils`, now explicitly included in CI's system tools.
