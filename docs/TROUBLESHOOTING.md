# Troubleshooting

## `rustc` or `cargo` is not recognized

Close PowerShell after installing Rust and open a new window. Rust normally adds `%USERPROFILE%\.cargo\bin` to the user PATH.

## Tauri reports missing Windows build tools

Install Visual Studio Build Tools 2022 and select **Desktop development with C++**. Restart PowerShell afterward.

## The browser preview works but desktop data does not persist

`npm run dev` is only a browser preview. Use `npm run tauri:dev` for the desktop application and SQLite persistence.

## PDF import returns no text

The PDF may contain scanned images instead of embedded text. CareerTracker does not perform OCR. Paste the resume text manually or export a text-based PDF from the source document.

## A resume is reported as a duplicate

Duplicate detection uses normalized extracted or supplied text. Renaming the file or changing its file-system timestamps does not create a new resume. Dates written inside the resume remain part of its content.

## AI connection fails

Check that the selected provider matches the stored key, the model is available to the account, the key is valid, the account has quota, and the computer can reach the provider endpoint.

## Cloudflare R2 / S3 test fails

For Cloudflare R2, verify:

```text
Bucket: career-tracker
Region: auto
Endpoint: https://ACCOUNT_ID.r2.cloudflarestorage.com
```

Use the R2 S3 **Access Key ID** and **Secret Access Key** generated for a token with object read/write access to the bucket. CareerTracker does not use the Cloudflare API token value for S3 authentication. Do not create folders manually; CareerTracker creates object-key prefixes.

The connection test performs a one-item object listing. S3 operations stop after one initial request plus at most two retries. Authentication, permission, bucket-name, and other normal 4xx failures are not retried.

## A remote resume is not downloaded when opening a role

This is expected. Opening a role loads application metadata from SQLite. Use **View resume** or **View cover letter** to request the associated document explicitly.

## A deleted role also removed a resume

CareerTracker removes a role-specific resume automatically only when all of the following are true:

- the deleted role referenced the resume
- the resume is not Current Resume
- no other role references it

Shared resumes and Current Resume are retained.

## Current Resume cannot be deleted

A role still references it. Change or remove the resume association on those roles, or delete the roles first.

## Backup restore skipped an application

Restore is additive. When the application ID already exists in the current database, CareerTracker keeps the current copy and skips the backup application's data, questions, and notes.

## Restored application has no job description

Job descriptions are intentionally excluded from application-data backups.

## Tectonic cannot start

Tectonic is optional. If PDF generation is needed later, install Tectonic or enter its full executable path in Settings.


## Diagnostics and Error IDs

Failed native operations include an error ID such as `CT-20260807-0034`. In **Settings → Diagnostics** you can:

- open the log folder
- copy the recent log
- clear logs

On Windows, logs are stored under `%LOCALAPPDATA%\CareerTracker\logs`. Logs rotate at approximately 1 MB and retain three prior files.

Diagnostics record operation names, provider/model names, S3 bucket/endpoint host, object keys, HTTP status, attempt counts, and provider request IDs when available. They do not record API keys, S3 secrets, AI prompts, resume/cover-letter contents, job descriptions, application answers, or signed URLs.

Network retries are capped at three total attempts. A second retry sequence begins only when the user performs the action again.
