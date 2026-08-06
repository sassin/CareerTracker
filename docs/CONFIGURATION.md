# Configuration

## Local workspace

The workspace stores generated LaTeX, PDFs, and exported backups. The SQLite database is stored in CareerTracker’s application-data directory, not in the workspace.

When changing the workspace, CareerTracker asks whether to copy existing generated files and backups. If accepted, stored generated-file paths are updated to the new location. If declined, existing paths remain unchanged and future files use the new workspace.

## AI providers

AI is optional. Select one provider, enter a model available to your account, save the API key, and test the connection.

Supported adapters:

- OpenAI Responses API
- Anthropic Messages API
- Google Gemini generateContent API

Keys are stored through the operating-system credential manager. They are not included in backups.

Provider costs, limits, model availability, and data-retention rules are controlled by the provider. Review those terms before sending resume or career information.

## Tectonic

Tectonic is optional and is used only for LaTeX-to-PDF export.

Set either:

- `tectonic` when the executable is available on `PATH`, or
- the full path to `tectonic.exe`.

CareerTracker writes a `.tex` file into the workspace and invokes Tectonic directly. Compilation errors are returned in the application.

## S3-compatible mirror

Local storage remains primary. Configure:

- bucket
- region
- prefix
- optional custom endpoint
- access key and secret key

A custom endpoint supports services such as Cloudflare R2, Backblaze B2, and MinIO when they expose an S3-compatible API.

The current mirror requires permission to inspect the bucket and upload objects under the configured prefix. For Amazon S3, use a dedicated identity with only the required bucket and object permissions. Do not use administrator credentials.

S3 sync is explicit through **Sync workspace now**. It does not synchronize the active SQLite database or resolve edits from multiple computers.

## Secrets excluded from backup

The following are intentionally excluded:

- OpenAI API key
- Anthropic API key
- Gemini API key
- S3 access key
- S3 secret key

Re-enter them after moving to another computer.
