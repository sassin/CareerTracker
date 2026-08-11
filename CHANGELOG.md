# Changelog

## Unreleased

- Keep cumulative AI call and token totals until the user explicitly clears usage.
- Retain only the 10 most recent AI call details to prevent unbounded telemetry growth.
- Rename the AI usage reset action to **Clear usage** and reset both cumulative totals and recent activity together.
- Migrate existing AI usage into cumulative totals while preserving only the newest 10 detailed calls.

## 1.2.11

- Compact Questions repository with search and a single Scope filter for Common Qs or a company.
- Replaced separate question scope/company fields with one Scope selector.
- Compact, searchable Career Library list with category filtering.
- Career Profile Summary is collapsed by default.
- Career Entry editor now places Technologies and Results above Summary.
- Summary action is now Refine summary; it generates when empty and refines when populated.
- Detailed Description is collapsed by default and includes Refine description, which generates when empty and refines when populated.
- Added an editable Career Entry Description AI prompt under Settings.
- No database migration changes.

# CareerTracker 1.2.10

- Fixed **Open PDF** by granting Tauri's required local-path opener permission.
- Hide **Open PDF** in S3-only mode; it remains available in Local and Hybrid storage modes.
- Reworked cover-letter PDF body layout to use width-based wrapping and true full justification for every non-final body line.
- Refined PDF typography and horizontal-rule color/placement to more closely match the saved cover-letter reference.
- No database migration changes.

# Changelog

## 1.2.9

- Fix native window close button becoming unresponsive in development and after close-guard state changes.
- Register the Tauri close-request listener once and read current guard state through a React ref.
- Use the native Tauri confirmation dialog for protected closes.
- Remove React StrictMode double-mount from the desktop root to avoid tearing down the native close listener during development.
- Explicitly allow the Tauri window destroy command used after a confirmed protected close.

## 1.2.8
- Restored the more readable 1.2.6 application typography while keeping compact list geometry.
- Made Add company and Add role permanent global header actions on every screen and removed duplicate company/role add actions from individual pages.
- Standardized the two global action buttons to the same dimensions across views.
- Combined AI prompts and AI usage into one Settings tab.
- Made AI prompt editors collapsible and added a one-line description explaining each prompt's purpose.

## 1.2.7

- Justify cover-letter PDF body paragraphs for balanced left/right margins while keeping structural lines left-aligned.
- Add AI Usage tracking for calls and token counts without storing prompt, resume, JD, or generated document content.
- Add AI Usage tab with date range, totals, per-call provider/model/action/status, and clear-history control.
- Split Documents into compact Resumes and Cover Letters tabs with company and created-date filters.
- Add document creation timestamps through migration 7.
- Further compact dashboard status counters, role/company/document rows, and overview actions.
- Add compact Add Company and Add Role actions on Overview.
- Confirm before closing only when an edit is open, Settings has unsaved changes, or an operation is running.

## 1.2.6

- Made the Overview status counters and role rows substantially more compact for large application volumes.
- Moved Current Resume and Cover Letter Format into minimal sidebar shortcuts with current filenames.
- Replaced company cards with compact name-and-control rows; company summaries remain inside company details only.
- Replaced role company dropdowns with a searchable type-ahead company picker.
- Compacted role questions, notes, document controls, and Work Arrangement management.
- Placed AI and S3 settings side-by-side in a balanced Settings layout.
- Moved all company-detail word limits, resume-growth allowance, and cover-letter length into configurable Settings fields.
- Added an AI Prompts Settings tab for editable Company Details, Career Entry Summary, Career Profile Summary, Resume Review, and Cover Letter task prompts with restore-default actions. Hard schemas, no-fabrication rules, and configured limits remain enforced outside editable prompts.
- Strengthened conservative resume review so reasonable-fit resumes do not produce unnecessary variations.
- Added one-click native PDF export for cover letters only, using a restrained letter layout with candidate header, divider, recipient/Re line, evidence paragraphs, and sign-off. Resume PDF generation is no longer exposed in the UI.
- Cover-letter generation remains a separate role action and shares the role's optional Additional instruction with resume review.
- No database migration was added; new settings use the existing key/value settings table. Existing migrations remain unchanged.

## 1.2.5

- New roles default Date Applied to the user's local date.
- Work arrangement is a database-driven dropdown seeded with Remote, On-Site, Off-Shore, and Hybrid; values can be added or removed in Settings.
- Company AI fill is visible from the company form and bounded to concise high-level details.
- Role AI actions are separated into Check resume fit and Create cover letter.
- Added one shared per-role AI instruction field used by both resume review and cover-letter generation.
- Resume review is conservative: no variation is suggested for minor wording or optimization when the current resume is already a reasonable fit.
- AI-generated resume variations are capped at current resume word count + 20%.
- AI-generated cover letters are capped at 350 words.
- Current resume and cover-letter format uploads support multi-file LaTeX text bundles (.tex, .cls, .sty, .bib).
- Added migration 6 for configurable work arrangements and the per-role AI instruction. Existing migrations remain unchanged.

## 1.2.4

- Enabled the native Windows Credential Manager backend for secure credentials.
- Removed immediate S3 credential read-back verification to avoid Windows cross-thread ordering races.
- S3 credentials are verified when an S3 operation actually uses them.
- Fixed the allowed-secret count after adding the bundled S3 credential entry.

## 1.2.3

- Store S3 Access Key ID and Secret Access Key as one verified operating-system credential entry.
- Verify S3 credentials by reading them back immediately before reporting save success.
- Preserve compatibility with legacy separately stored S3 credential entries.
- Log the actual credential-manager read/write error without logging credential values.


## 1.2.2

- Changed S3/R2 connection testing from bucket metadata checks to a one-item `ListObjectsV2` request, matching the object permissions CareerTracker actually needs.
- Standardized external network operations to at most three total attempts: the initial request plus two retries.
- Disabled AWS SDK internal retries so S3 requests cannot multiply underneath CareerTracker's bounded retry loop.
- AI retries are limited to transport failures, HTTP 429, and HTTP 5xx responses; normal 4xx validation/authentication errors fail immediately.
- Added rotating diagnostic logs with error IDs and operation metadata while excluding API keys, S3 secrets, resume text, cover-letter text, job descriptions, answers, and prompts.
- Added Settings diagnostics actions to open the log folder, copy the recent log, and clear logs.

## 1.2.1

- Restored migration 1 exactly as originally released so existing CareerTracker databases remain compatible.
- Added migration 5 to set an empty S3 region to `auto` without modifying previously applied migrations.

## 1.2.0

- Prepared the repository for public source distribution.
- Added Windows CI for frontend type checking/build and Rust `cargo check`.
- Added a manual GitHub Actions release workflow that builds Windows installers into a draft GitHub Release without committing binaries.
- Added development and release documentation for fresh clones and maintainers.
- Expanded `.gitignore` for installers, local databases, generated documents, editors, and build output.
- Added a source-tree release check script.
- Simplified prerequisite checking to core runtime/build dependencies; Tectonic remains optional.
- Documented committing generated npm/Cargo lock files after the first successful dependency resolution.

## 1.1.0

- Added Local only, S3 only, and Local + S3 document-storage modes.
- Added Cloudflare R2 / generic S3-compatible configuration with bounded retries.
- Added in-memory caching for fetched S3 text objects and explicit document loading from roles.
- Added local-first Current Resume and Cover Letter Format startup fallback to S3 snapshots.
- Added explicit deletion of Current Resume and Current Cover Letter Format.
- Added reference-aware orphan resume cleanup after role or company deletion.
- Added compact application-data backup to local files or S3-compatible storage.
- Excluded job descriptions, document bodies, Career Library data, credentials, and generated files from backups.
- Added additive backup restore where existing application IDs always keep the current local copy.
- Added resume and cover-letter reference reconnection during restore when matching local hashes are available.
- Removed implementation-oriented explanatory text from the interface.

## 1.0.0

- Added local-first company and role tracking with optional role fields.
- Added role deletion with cascading application-question and note cleanup.
- Added Current Resume and per-role resume selection or upload.
- Added normalized text hashing for resume duplicate detection.
- Added cover letter formats and company-bound cover letters.
- Added exact submitted application questions and answers.
- Added HR, hiring-manager, referral, and general role notes.
- Added editable Career Profile Summary and Career Library entry summaries.
- Added local Career Library relevance scoring.
- Added optional OpenAI, Anthropic, and Gemini adapters.
- Added optional LaTeX generation and Tectonic PDF compilation.
- Added Windows installer workflow and public setup documentation.
