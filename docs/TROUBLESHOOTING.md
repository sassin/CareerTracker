# Troubleshooting

## `rustc` or `cargo` is not recognized

Close PowerShell after installing Rust and open a new window. Rust normally adds `%USERPROFILE%\.cargo\bin` to the user PATH.

## Tauri reports missing Windows build tools

Install Visual Studio Build Tools 2022 and select **Desktop development with C++**. Restart PowerShell afterward.

## The browser preview works but desktop data does not persist

`npm run dev` is only a browser preview and uses browser storage. Use `npm run tauri:dev` for the desktop application and SQLite persistence.

## PDF import returns no text

The PDF may contain scanned images rather than embedded text. CareerTracker does not perform OCR. Paste the resume text manually or export a text-based PDF from the source document.

## A resume is reported as a duplicate

Duplicate detection uses normalized extracted or supplied text. Renaming the file or changing its file-system timestamps does not create a new resume. Edit the content before importing when it is genuinely a different version.

## Tectonic cannot start

Install Tectonic or enter the full executable path in Settings. Use the official Tectonic Windows distribution and verify the command independently:

```powershell
tectonic --version
```

## LaTeX compilation fails

Review the displayed compiler output. Common causes are incomplete LaTeX, unsupported packages, unescaped special characters, or references to local files that are not available in the generated document directory.

## AI connection fails

Check that:

- the selected provider matches the stored key
- the model name is available to that account
- the key has not expired
- the provider account has available quota
- the computer can reach the provider endpoint

Manual tracking remains available when AI is disabled or unavailable.

## S3 test fails

Verify the bucket, region, endpoint, and credentials. Custom endpoints commonly require path-style requests, which CareerTracker enables. Confirm the credentials allow bucket inspection and object uploads.

## Before replacing source code

Export a backup from Settings. Source upgrades use database migrations, but a separate backup is the safest rollback path.
