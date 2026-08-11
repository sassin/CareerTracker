# CareerTracker

CareerTracker is a single-user desktop application for tracking companies, job roles, resumes, cover letters, application questions, notes, and reusable career evidence.

## What it tracks

- companies and high-level company information
- multiple roles per company
- optional job ID, URL, location, work arrangement, date applied, status, and job description
- Current Resume plus role-specific resume selection/upload
- cover-letter format/sample and company-specific cover letters
- generic and company-specific question repository
- exact questions and answers submitted with an application
- HR, hiring-manager, referral, and general notes
- Collapsible Career Profile Summary and compact, searchable Career Library entries

Statuses are: **Preparing**, **Applied**, **In Process**, **Success**, and **Learning Experience**.

## Optional integrations

CareerTracker runs without external services. When configured, it supports:

- OpenAI
- Anthropic Claude
- Google Gemini
- Amazon S3 and S3-compatible storage such as Cloudflare R2

## Run from source on Windows

### Prerequisites

Install:

1. Node.js 20 or later
2. Rust through `rustup`
3. Visual Studio Build Tools 2022 with **Desktop development with C++**
4. Microsoft Edge WebView2 Runtime

Check the command-line prerequisites:

```powershell
.\scripts\check-prerequisites.ps1
```

### Clone and run

```powershell
git clone <repository-url>
cd CareerTracker
npm install
npm run typecheck
npm run tauri:dev
```

The first Rust build compiles the Tauri and native dependencies and can produce a long compile log. Subsequent builds reuse Cargo's build cache.

`npm run dev` runs only the browser frontend. Use `npm run tauri:dev` for the real desktop application with SQLite and native features.

## Build your own Windows installer

```powershell
npm run tauri:build
```

Generated installers are placed under:

```text
src-tauri\target\release\bundle\
```

They are build artifacts and are not committed to the repository.

If the maintainer publishes GitHub Releases, users can download the generated Windows installer instead of building from source.

## Data storage

SQLite stores the operational records in CareerTracker's application-data directory, including:

- companies
- roles/applications
- job descriptions
- resume and cover-letter text
- questions and submitted answers
- notes
- Career Library
- non-secret settings

Credentials are stored through the operating-system credential manager.

### Document storage modes

- **Local only**
- **S3 only**
- **Local + S3**

Opening a role does not require an S3 read. CareerTracker uses local SQLite text for normal browsing and only reads configured S3 objects when an explicit remote object is needed. S3 reads are cached in memory for the process lifetime. Each S3 operation uses one initial attempt plus at most two retries.

### Cloudflare R2 example

Create the bucket only. Do not manually create folders.

```text
Storage mode: S3 only
Bucket: career-tracker
Region: auto
Prefix: careertracker
Endpoint: https://ACCOUNT_ID.r2.cloudflarestorage.com
Access key: <R2 access key ID>
Secret key: <R2 secret access key>
```

Use an R2 token restricted to the selected bucket with object read/write access.

## Resumes

**Upload Current Resume** sets the uploaded or deduplicated resume as Current Resume.

A resume uploaded inside a role is associated only with that role unless selected elsewhere. Duplicate detection hashes normalized resume text, so filenames and file-system timestamps do not affect the fingerprint.

Supported imports:

- PDF with embedded text
- TXT
- Markdown
- LaTeX text bundle (`.tex` with optional `.cls`, `.sty`, `.bib`)

A Current Resume can be deleted when no role references it. Deleting a role removes its resume automatically only when the resume is not Current Resume and no other role references it.

## Cover letters

CareerTracker maintains a central cover-letter format/sample and company-scoped cover letters. A company cover letter can be reused across roles at that company. Current Cover Letter Format can be deleted without deleting completed company letters.

## Career Library and resume review

Career Library stores verified work, projects, achievements, skills, certifications, and career stories. It uses a compact searchable list with category filtering. The Career Profile Summary is collapsed by default; entry summaries and detailed descriptions are editable and can be generated/refined with AI from verified entry facts.

With an AI provider configured, **Check resume fit** uses:

- company information
- job description
- selected resume text
- Career Profile Summary
- up to five locally scored high-relevance Career Library entries

It returns a conservative fit assessment and suggests a new resume only for material gaps. The resume growth allowance is configurable in Settings and defaults to 20%. **Create cover letter** is a separate action; its maximum length is also configurable in Settings and defaults to 350 words. One optional per-role instruction is shared by both AI actions. Company-detail limits are configurable as well.

## Application-data backup

Backups are created only when the user selects **Create backup**. The destination can be local or configured S3 storage.

Backups include:

- companies and company notes
- role/application metadata
- question repository entries
- exact application questions and submitted answers
- application notes
- lightweight resume and cover-letter references

Backups exclude:

- job descriptions
- resume and cover-letter text/files
- Career Library content
- generated files
- credentials
- AI review output

**Load backup** merges records into the current database. If an application ID already exists, the current application is kept and the backup copy, including its old questions and notes, is skipped. New applications are imported with an empty job description.

## Repository layout

```text
src/                    React/TypeScript UI and application logic
src-tauri/              Rust desktop layer, Tauri config, migrations, icons
docs/                   User, configuration, development, and release docs
scripts/                Windows prerequisite/release checks
.github/workflows/       CI and optional Windows release automation
```

For development details see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). For configuration see [docs/CONFIGURATION.md](docs/CONFIGURATION.md). For release steps see [docs/RELEASING.md](docs/RELEASING.md).

## Source-control policy

Do not commit:

- `.exe`, `.msi`, or other generated installers
- `node_modules`, `dist`, or `src-tauri/target`
- SQLite databases
- application backups
- API keys or S3 credentials
- personal resumes, cover letters, or application data

After the first successful local dependency install/build, commit `package-lock.json` and `src-tauri/Cargo.lock` for reproducible dependency resolution.

## License

MIT. See [LICENSE](LICENSE).
