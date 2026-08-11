# User guide

## Add a role

Use **Add role** from Overview or Roles. Posting fields are optional, and a role can be saved before all information is available.

A new role defaults Date Applied to the local current date; it remains editable or can be cleared. Work Arrangement is selected from the database-configured list in Settings. Company selection is searchable: type part of a company name and choose a matching saved company.

A role can contain:

- company, title, job ID, URL, location, and work arrangement
- date applied and status
- job description
- selected resume and company-bound cover letter
- exact submitted application questions and answers
- HR, hiring-manager, referral, and general notes

Deleting a role deletes its submitted questions and notes. If the role used a resume that is not Current Resume and no other role references that resume, CareerTracker also removes the orphaned resume record.

## Current Resume

Use **Upload Current Resume** whenever your latest complete resume changes. That action always sets the uploaded or deduplicated resume as Current Resume.

Uploading or selecting a resume inside a role does not change Current Resume.

Supported imports:

- PDF: readable text is extracted
- TXT or Markdown: text is retained
- LaTeX bundle: select the primary `.tex` file together with optional `.cls`, `.sty`, and `.bib` files; the primary `.tex` content is used for matching and duplicate detection

CareerTracker hashes normalized document text for duplicate detection. Filenames and file-system timestamps are excluded from the fingerprint.

Current Resume can be deleted when no role references it. If a role references it, remove or change those references first.

## Role resume

A role can select an existing resume or upload another resume. The role stores only the relationship to that resume record.

Opening a role does not trigger an S3 download. Use **View resume** explicitly when you want to open the associated resume. Remote text fetched during the session is held in memory until CareerTracker exits.

## Cover letter format and cover letters

Upload or paste a sample under **Documents → Cover letter formats**. Current Cover Letter Format can be deleted without deleting finished company cover letters.

A finished cover letter belongs to one company and may be selected by multiple roles at that company. A role may also upload its own company-specific letter.

Use **View cover letter** to open the selected letter explicitly.

## Career Library

Maintain the editable **Career Profile Summary** at the top of Career Library. Add verified entries for work, projects, achievements, skills, certifications, and career stories.

Career Profile Summary is collapsed by default. Career entries are shown in a compact searchable list with category filtering. Each entry can contain a concise editable summary and a collapsible detailed description. With AI configured, **Refine summary** and **Refine description** generate the field when empty or improve the existing text when populated, using only verified facts already present in the entry.

## Resume review

Inside a role, select a resume (or rely on Current Resume), add the job description, and choose **Check resume fit**.

CareerTracker selects up to five high-relevance Career Library entries and supplies the configured AI provider with:

- company information
- role and job description
- selected resume text
- Career Profile Summary
- selected Career Library evidence

The result includes an assessment and evidence used. CareerTracker asks for a new resume only when there is a material representation gap; minor keyword, style, or wording differences should not create a new variation. The maximum resume growth percentage is configurable in Settings and defaults to 20%.

Use the separate **Create cover letter** action when needed. The cover-letter maximum is configurable in Settings and defaults to 350 words. The optional **Additional instruction** field on the role is sent to either AI action.

Generated cover letters can be exported directly to PDF from the cover-letter editor. The PDF uses a restrained business-letter layout with a candidate header, divider, recipient/Re line, body paragraphs, and sign-off. Resume PDF export is not exposed.

Use **Settings → AI Prompts & Usage** to edit the task prompts used for Company Details, Career Entry Summary, Career Entry Description, Career Profile Summary, Resume Review, and Cover Letter. Each prompt can be restored to its default. Application-enforced schemas, no-fabrication rules, and output limits are not editable there.

Saving suggested resume text creates a separate resume record. It does not become Current Resume automatically.

## Application data backup

Open Settings and use **Create backup** or **Load backup**.

The backup contains:

- companies and company notes
- role/application metadata
- generic and company-specific question repository entries
- exact application questions and submitted answers
- application notes
- lightweight resume and cover-letter references used to reconnect existing local documents when possible

The backup deliberately excludes:

- job descriptions
- resume and cover-letter text or files
- Career Library content
- generated LaTeX/PDF files
- attachments
- credentials
- AI review output

A backup can be saved locally or to configured S3-compatible storage.

Loading a backup merges it into the current database. Existing local application IDs always win. When an application ID already exists, the backup copy and its questions and notes are skipped entirely. New applications are imported with an empty job description.
