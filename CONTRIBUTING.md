# Contributing

Keep changes focused on the individual job-application workflow.

Before opening a pull request:

1. Run `npm run typecheck`.
2. Run `npm run build`.
3. Run `npm run tauri:dev` and verify SQLite persistence.
4. Test manual workflows with AI disabled.
5. Confirm no credentials, personal resumes, database files, or generated documents are committed.
6. Add a database migration instead of editing an already released migration.

Avoid introducing autonomous agents, hosted-account requirements, telemetry, or unrelated career-management features.
