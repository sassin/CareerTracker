# Data model

## Company

Stores high-level editable company information. AI-assisted lookup is optional.

## Role

A role is stored internally as an application record. It contains optional posting details, status, job description, selected resume, selected cover letter, review output, and general notes.

## Resume

A resume is a central text record with:

- name
- source type
- editable text
- normalized content hash
- optional LaTeX
- optional generated PDF path
- notes

The Current Resume is a setting that points to one resume record.

## Cover letter format

A central sample used as a writing and formatting reference.

## Cover letter

A company-bound text record that can be selected by multiple roles at the same company.

## Question

A generic or company-specific reusable question. It may include a reusable answer.

## Application question

The exact question and exact answer submitted for one role. No answer versioning is used.

## Application note

A role-aligned HR, hiring-manager, referral, or general note.

## Career entry

A verified career fact source: work, project, achievement, skill, certification, or career story. Each entry includes an editable summary used in local matching and AI requests.

## Settings

Stores non-secret configuration. API keys and S3 credentials are stored separately in the operating system credential manager.
