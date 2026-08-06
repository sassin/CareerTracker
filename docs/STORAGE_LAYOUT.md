# Workspace layout

```text
<workspace>/
├── generated/
│   ├── resumes/
│   │   └── <resume-id>/
│   │       ├── resumes-<timestamp>.tex
│   │       └── resumes-<timestamp>.pdf
│   └── cover-letters/
│       └── <cover-letter-id>/
│           ├── cover-letters-<timestamp>.tex
│           └── cover-letters-<timestamp>.pdf
└── backups/
    └── careertracker-backup-<timestamp>.json
```

Imported resumes and letters are not copied into this folder. Their extracted or supplied text is stored in SQLite. This prevents filename-based duplication and keeps the database record as the source of truth.
