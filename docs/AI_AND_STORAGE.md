# AI and storage boundaries

## AI requests

AI calls occur only from explicit user actions.

Role resume review uses:

- company information
- job description
- selected resume text
- saved Career Profile Summary
- up to five locally selected high-relevance Career Library entries
- cover-letter format/sample when a new letter is required

CareerTracker does not send unrelated Career Library entries.

## SQLite

SQLite stores:

- companies
- roles/applications
- job descriptions
- status and application metadata
- resume and cover-letter text records
- questions and submitted answers
- application notes
- Career Library
- settings excluding secrets

Normal role browsing does not require S3.

## S3

S3-compatible storage is used for explicit remote objects such as Current Resume/format snapshots and S3 backups. It is not a remote relational database.

CareerTracker prefers local data. An S3 GET is used only when a requested remote object is not already available locally/session-cached.

## Backup boundary

Application backup is deliberately smaller than the SQLite database. Job descriptions, document bodies, Career Library content, credentials, and AI review output are excluded.


## Retry boundary

CareerTracker owns the retry policy for external calls. S3 SDK internal retries are disabled. Each network operation has at most three total attempts (initial request plus two retries). AI calls retry only transport failures, HTTP 429, and HTTP 5xx responses. Normal authentication, permission, validation, and other 4xx failures return immediately.

## Diagnostics boundary

Diagnostic logs contain technical operation metadata and error IDs, not user document bodies or credentials. S3 logs may contain bucket names, endpoint hosts, object keys, status/error codes, and attempt counts. AI logs may contain provider/model, HTTP status, and request ID, but never the prompt or generated document text.
