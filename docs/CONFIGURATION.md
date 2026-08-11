# Configuration

## Storage mode

### Local only

Generated files use the selected local folder. SQLite remains in the application-data directory.

### S3 only

Use S3-compatible object storage for remote Current Resume / Cover Letter Format snapshots and S3 backups. SQLite remains local for fast application browsing and text access.

### Local + S3

Local data is preferred. S3 is a remote snapshot/fallback and optional backup destination.

## Cloudflare R2

Create the bucket only. Do not create folders manually.

For a bucket named `career-tracker`:

```text
Bucket: career-tracker
Region: auto
Prefix: careertracker
Endpoint: https://ACCOUNT_ID.r2.cloudflarestorage.com
```

Create an R2 API token scoped to the bucket with object read/write access. Enter its Access Key ID and Secret Access Key in CareerTracker.

CareerTracker creates object keys such as:

```text
careertracker/state/current-resume.json
careertracker/state/cover-letter-format.json
careertracker/backups/careertracker-backup-YYYYMMDD-HHMMSS.json
```

S3 operations use one initial attempt plus at most two retries. Downloaded text objects are kept in memory for the current CareerTracker process.

## AI providers

Configure one provider and model:

- OpenAI
- Anthropic Claude
- Google Gemini

Keys are stored in the operating-system credential manager.

## Local folder

The local folder is used for generated LaTeX/PDF files when Local or Local + S3 mode is selected. Changing it can optionally copy existing generated files and update stored paths.

## Tectonic

Tectonic is only needed for PDF compilation. It is not required for tracking, AI review, resume text, cover-letter text, or backups.
