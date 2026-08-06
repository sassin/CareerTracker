# CareerTracker Update 01

## Included changes

- Adds **Add role** directly to the Overview page.
- Removes **Success** from the Overview summary cards while retaining it as an application status.
- Gives Active Applications the full Overview width.
- Moves Current Resume and Cover-letter Format into a lower document row.
- Adds a local, evidence-based **Resume update plan** inside each application.
- Adds resume upload for PDF, text, and multi-file LaTeX bundles.
- Computes a SHA-256 content fingerprint and prevents duplicate resume records.
- Copies uploaded resume and cover-letter files into the selected local workspace.
- Adds a workspace folder browser.
- When changing folders, offers:
  - migrate existing managed document folders; or
  - use the new folder for future uploads while preserving old document links.
- Adds a database migration for resume fingerprints and application resume-update notes.

## Apply to an existing project

1. Stop `npm run tauri:dev` with `Ctrl+C`.
2. Extract this ZIP into the CareerTracker project root and overwrite matching files.
3. Keep your existing `src-tauri/icons` folder.
4. Run:

```powershell
npm run tauri:dev
```

Cargo will add the new `sha2` dependency. The SQLite migration runs automatically.

## Current limitation

The local-folder storage workflow is implemented in this update. S3 fields remain configuration-only until the S3 adapter and secure credential storage are connected.

The resume update plan currently performs deterministic local matching between the job description, editable Current Resume text, and Career Library entries. A later AI provider connection can refine the same editable plan without changing the data model.
