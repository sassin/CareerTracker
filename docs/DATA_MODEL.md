# Data model

## Company

High-level company information and notes. A company can have many roles.

## Application / role

All user-facing role fields are optional. The record can contain title, company, job ID, URL, location, work arrangement, applied date, status, job description, selected resume, selected cover letter, notes, and one optional AI instruction shared by role-level AI actions. Work-arrangement choices are stored in a configurable lookup table; the selected label is retained on the role.

## Resume

A central text record with source type and normalized-content hash. LaTeX resumes can retain a text bundle containing the primary `.tex` file plus `.cls`, `.sty`, and `.bib` support files. The fingerprint is based on the primary resume content, not filenames or support files. One resume may be referenced by multiple roles. Current Resume is a setting pointing to one resume ID.

## Cover letter format

A central sample/format record used as a reference for future letters.

## Cover letter

A company-scoped text record. It may be reused across roles at the same company.

## Question repository

Questions are generic or company-specific. A reusable answer may be stored.

## Application question

Stores the exact question and exact submitted answer for one application. No answer versioning.

## Application note

General, HR/recruiter, hiring-manager, or referral note linked to one application.

## Career Library

Projects, work, achievements, skills, certifications, and career stories. Each entry can have a concise editable summary.

## Backup model

The backup format is intentionally separate from `AppData`. It excludes job descriptions and document bodies. Restore is additive: existing application IDs are never overwritten.
