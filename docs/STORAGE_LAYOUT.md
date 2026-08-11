# Storage layout

## SQLite

CareerTracker's SQLite database is stored by the Tauri SQL plugin in the application's data directory.

## Local generated files

When a local folder is enabled:

```text
<workspace>/
  generated/
    resumes/
    cover-letters/
```

## S3-compatible storage

No folders need to be created manually. S3/R2 uses object-key prefixes.

```text
<prefix>/state/current-resume.json
<prefix>/state/cover-letter-format.json
<prefix>/backups/careertracker-backup-*.json
```

## S3 read policy

- no S3 read when opening a normal role
- local Current Resume is preferred at launch
- S3 Current Resume is a fallback only when the configured local record is missing
- S3 backup reads occur only when the user selects Load backup
- S3 GET results are cached in memory until CareerTracker exits
- each operation has at most two retries after the first attempt
