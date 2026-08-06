# CareerTracker

CareerTracker is a local-first desktop application for tracking job applications, the resumes and cover letters used for each role, submitted application questions, role-aligned notes, and reusable career evidence.

The application works without AI and without cloud storage. AI providers and S3-compatible storage are optional.

## Core behavior

- A company can have multiple roles.
- Role fields are optional so an incomplete posting can be saved and completed later.
- Statuses are limited to Preparing, Applied, In Process, Success, and Learning Experience.
- The Current Resume is the most recent resume uploaded through **Upload Current Resume**.
- A role can use an existing resume or upload a separate resume without changing Current Resume.
- Resume duplicate detection hashes normalized document text. File name, upload time, file metadata, and operating-system timestamps are not included.
- PDF resumes and cover letters are stored as extracted text. TXT, Markdown, and LaTeX source are stored as text in their supplied format.
- Cover letter samples define the preferred writing and formatting reference.
- Company cover letters can be reused across roles at the same company.
- Application questions store the exact question and exact submitted answer. Answers are not versioned.
- Deleting a role removes its submitted questions and notes but does not remove shared resumes, cover letters, companies, or Career Library entries.
- AI actions are explicit. They never replace a resume, cover letter, or application record without user review.

## Technology

- Tauri 2 desktop shell
- React and TypeScript interface
- Rust local service layer
- SQLite local database
- Operating-system credential manager for API and storage credentials
- Optional OpenAI, Anthropic Claude, or Google Gemini connection
- Optional Amazon S3 or S3-compatible storage mirror
- Optional Tectonic LaTeX compiler

## Windows prerequisites

1. Node.js 20 or later
2. Rust installed through `rustup`
3. Visual Studio Build Tools 2022 with **Desktop development with C++**
4. Microsoft Edge WebView2 Runtime
5. Optional: Tectonic for LaTeX-to-PDF export

Run the included check:

```powershell
.\scripts\check-prerequisites.ps1
```

## Run locally

```powershell
npm install
npm run tauri:dev
```

The first Rust build downloads and compiles native dependencies.

## Build the Windows installer

```powershell
npm install
npm run tauri:build
```

Installers are written under:

```text
src-tauri\target\release\bundle\
```

## First-use setup

1. Open **Settings**.
2. Choose a local workspace folder.
3. Upload a Current Resume from Overview or Documents.
4. Add or upload a cover letter sample.
5. Add Career Library entries and edit the Career Profile Summary.
6. Add companies and roles.
7. Configure AI or S3 only when needed.

## AI setup

CareerTracker supports OpenAI, Anthropic Claude, and Google Gemini through direct API calls from the Rust layer.

In **Settings → AI assistance**:

1. Enable AI actions.
2. Select the provider.
3. Enter a model name available to your account.
4. Enter the API key.
5. Save the key and test the connection.

Keys are stored in the operating system credential manager. They are not stored in SQLite, source files, environment files, or browser storage.

AI is used only when the user clicks an AI action. A role-level resume review sends:

- company information
- job description
- selected resume text
- editable Career Profile Summary
- up to five locally selected high-match Career Library entries
- the cover letter sample when a new cover letter is requested

## Resume and cover letter workflow

CareerTracker stores document content as text. LaTeX and PDF are optional exports.

1. Review or edit document text.
2. Select **Create LaTeX** when AI is configured.
3. Review the generated LaTeX.
4. Select **Compile PDF**.
5. CareerTracker runs Tectonic and stores the generated `.tex` and `.pdf` files in the workspace.

For a supplied `.tex` file, the imported LaTeX is retained as text and can be compiled directly.

## Tectonic

Install Tectonic using its official Windows instructions, then either:

- add `tectonic.exe` to `PATH`, or
- enter its full path under **Settings → Tectonic executable**.

CareerTracker invokes Tectonic directly and does not use a shell command.

## Storage

SQLite is always local and remains the system of record.

The selected workspace contains only generated files and backups:

```text
CareerTrackerWorkspace/
├── generated/
│   ├── resumes/
│   └── cover-letters/
└── backups/
```

S3 mode is a mirror, not a remote database. It uploads workspace files to Amazon S3, Cloudflare R2, Backblaze B2, MinIO, or another S3-compatible service. It does not provide simultaneous multi-device editing.

## Backup and restore

Use **Settings → Export backup** to write a complete JSON backup of application data into the workspace. Use **Restore backup** to replace the local data with a selected CareerTracker backup.

Create a backup before upgrading or changing database-related code.

## Updating an existing CareerTracker foundation folder

1. Close CareerTracker.
2. Back up the current data from the application when possible.
3. Replace the project source with this repository.
4. Preserve any uncommitted personal files outside the source tree.
5. Run:

```powershell
npm install
npm run tauri:dev
```

The included SQLite migrations add resume review, LaTeX, document hashes, Career Profile, and AI settings while retaining existing companies and roles. Migration 4 corrects cover-letter duplicate detection so it is scoped to each company.

## Public repository setup

Before the first commit:

```powershell
git init
git add .
git commit -m "Initial CareerTracker release"
```

After the first successful local build, commit the generated `package-lock.json` and `src-tauri/Cargo.lock` so public builds use resolved dependency versions.

## Privacy and security

- No hosted CareerTracker backend is used.
- No analytics or telemetry are included.
- AI requests occur only after an explicit user action.
- Credentials use the operating system credential manager.
- S3 credentials should be restricted to the selected bucket or prefix.
- Generated LaTeX should be reviewed before compilation.
- CareerTracker does not submit job applications or send messages.

See [SECURITY.md](SECURITY.md) for reporting and operational guidance.

## Additional documentation

- [User guide](docs/USER_GUIDE.md)
- [Configuration](docs/CONFIGURATION.md)
- [Data model](docs/DATA_MODEL.md)
- [AI and storage boundaries](docs/AI_AND_STORAGE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Development commands

```powershell
npm run dev          # Browser-only UI preview
npm run typecheck    # TypeScript validation
npm run build        # Production frontend build
npm run tauri:dev    # Desktop development
npm run tauri:build  # Windows installers
```

## License

MIT. See [LICENSE](LICENSE).
