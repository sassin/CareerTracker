# User guide

## Add a role

Use **Add role** from Overview or Roles. All visible posting fields are optional. A role can be saved without selecting a company and completed later.

For each role you can record:

- company, title, job ID, URL, location, and work arrangement
- date applied and status
- complete job description
- selected resume and company-bound cover letter
- submitted application questions and answers
- HR, hiring-manager, referral, and general notes

Deleting a role also deletes only its submitted questions and notes. Shared documents, the company, and Career Library entries remain.

## Current Resume

Use **Upload Current Resume** when your latest complete resume changes. The uploaded resume becomes Current Resume even when CareerTracker recognizes it as an existing document.

Uploading or selecting a resume inside a role does not change Current Resume.

Supported imports:

- PDF: readable text is extracted
- TXT or Markdown: text is retained
- TEX: LaTeX source is retained as text

CareerTracker hashes normalized document text to detect exact duplicates. Names and file-system timestamps are not part of the hash.

## Cover letters

Upload a sample under **Documents → Cover letter formats**. It is used as the writing and formatting reference for AI-assisted letters and LaTeX generation.

A finished cover letter belongs to one company and may be selected by multiple roles at that company. A role may also upload its own letter, which is added to that company’s letter list.

## Career Library

Maintain the editable **Career Profile Summary** at the top of Career Library. Add individual verified entries for work, projects, achievements, skills, certifications, and career stories.

Each entry has a concise editable summary. With AI enabled, **Create summary** drafts it from the full entry. Review before saving.

## Resume review

Inside a role, select a resume and add the job description. Then choose **Review resume and prepare**.

CareerTracker locally selects up to five relevant Career Library entries and sends:

- high-level company information
- role and job description
- selected resume text
- Career Profile Summary
- selected Career Library evidence

The result is an editable assessment and suggested resume text. If the role has no cover letter, the same request may also create one. Existing cover letters are not replaced.

Save suggested resume text as a separate resume record. It does not become Current Resume automatically.

## Manual use

AI is never required. Without AI, all companies, roles, resumes, cover letters, questions, answers, notes, statuses, and Career Library records remain fully editable. A basic local terminology check is shown when a role has both a job description and selected resume.

## Backup

Choose a workspace folder in Settings, then use **Export backup**. The JSON backup contains all SQLite-backed application data and document text. Generated files remain in the workspace and can be mirrored separately to S3-compatible storage.
