# Development

CareerTracker is a Tauri 2 desktop application with a React/TypeScript frontend and a Rust desktop layer.

## Windows prerequisites

- Node.js 20 or later
- Rust installed with `rustup`
- Visual Studio Build Tools 2022 with **Desktop development with C++**
- Microsoft Edge WebView2 Runtime

Run the prerequisite check:

```powershell
.\scripts\check-prerequisites.ps1
```

## First run

```powershell
npm install
npm run typecheck
npm run tauri:dev
```

`npm run dev` starts only the browser frontend. Use `npm run tauri:dev` when testing SQLite, native file dialogs, secure credentials, S3, PDF import, or other desktop behavior.

## Build checks

Before opening a pull request:

```powershell
npm run typecheck
npm run build
cargo check --manifest-path src-tauri\Cargo.toml
```

For a full Windows bundle:

```powershell
npm run tauri:build
```

Generated installers are written below `src-tauri\target\release\bundle\` and are ignored by Git.

## Lock files

The first successful `npm install` creates `package-lock.json`; the first Cargo build creates `src-tauri/Cargo.lock`. Commit both lock files to the repository for reproducible dependency resolution. They are source-control files, not build artifacts.

## Database changes

Do not edit a migration that has already shipped. Add a new numbered migration under `src-tauri/migrations/` and register it in the Rust migration list.

## Data and credentials

Do not commit:

- SQLite databases
- resumes or cover letters
- application backups
- API keys or S3 credentials
- `node_modules`, `dist`, or `src-tauri/target`

Use test data only when developing publicly.
