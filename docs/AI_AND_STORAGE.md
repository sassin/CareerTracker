# AI and storage boundaries

## AI

The frontend creates narrow prompts for four operations:

- company profile completion
- Career Library entry summary
- Career Profile Summary
- role-specific resume review and cover letter creation
- LaTeX conversion

The Rust layer sends the prompt to the selected provider and returns raw text. The frontend validates and parses the expected JSON structure.

No provider is required. No AI action runs automatically.

## Career evidence selection

CareerTracker scores Career Library entries locally against the job description. Matching considers title, summary, skills, technologies, detailed description, and results. At most five entries above the minimum threshold are sent to the provider.

The displayed score is a relevance score, not a qualification percentage.

## Local storage

SQLite stores all application and document text records. Generated LaTeX, PDFs, and JSON backups are stored in the selected workspace.

## S3-compatible mirror

The S3 adapter uploads workspace files using the configured bucket, region, prefix, and optional custom endpoint. The local database is not queried remotely and is not synchronized between active installations.
