# Implementation sequence

The product remains one coherent build, but implementation should proceed in dependency order.

1. **Foundation completed in this package**
   - Calm desktop UI
   - SQLite schema and migrations
   - Manual CRUD for principal repositories
   - Current Resume pointer
   - Company-bound cover-letter validation
   - Optional-AI settings model
   - Local/S3 provider settings model

2. **Document ingestion**
   - Native file and folder picker
   - Copy selected files into the normalized workspace
   - Validate `.tex`, `.cls`, text, and PDF inputs
   - Open stored PDFs from the application

3. **LaTeX document engine**
   - Bundle Tectonic as a Tauri sidecar
   - Compile the uploaded resume source
   - Add a standardized cover-letter template contract
   - Generate PDFs into deterministic document folders

4. **Application detail workspace**
   - Add application-specific submitted questions and answers
   - Add HR, hiring-manager, referral, and general notes
   - Add direct document-opening actions

5. **S3 storage adapter**
   - Implement the same StorageProvider contract as local storage
   - Upload/download documents and encrypted database backups
   - Keep SQLite local; no live multi-device sync

6. **Optional AI adapter**
   - Secure key storage
   - Company detail suggestions
   - Job-description analysis
   - Resume-change proposal based on Current Resume and Career Library
   - Cover-letter and application-answer drafts
   - Every output remains editable and explicitly saved

7. **Packaging and public release**
   - Windows icon and signing configuration
   - NSIS and MSI testing
   - GitHub Actions release build
   - First-run setup and backup/restore validation
