# Contributing

Keep changes focused on the individual job-application workflow.

Before opening a pull request:

1. Run `npm install`.
2. Run `npm run typecheck`.
3. Run `npm run build`.
4. Run `cargo check --manifest-path src-tauri\Cargo.toml`.
5. Run `npm run tauri:dev` and verify SQLite persistence.
6. Test manual workflows with AI disabled.
7. Run `.\scripts\check-release.ps1` after removing local build output if preparing a source archive.
8. Confirm no credentials, personal resumes, database files, application backups, or generated installers are committed.
9. Add a new database migration instead of editing an already released migration.

Do not introduce hosted-account requirements, telemetry, autonomous application submission, or unrelated career-management features.
