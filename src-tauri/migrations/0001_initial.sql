PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  website TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  products_services TEXT NOT NULL DEFAULT '',
  headquarters TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS resumes (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('latex', 'text', 'pdf')),
  source_files TEXT NOT NULL DEFAULT '[]',
  editable_text TEXT NOT NULL DEFAULT '',
  pdf_path TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);


CREATE TABLE IF NOT EXISTS cover_letter_templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('latex', 'text', 'pdf')),
  source_files TEXT NOT NULL DEFAULT '[]',
  editable_text TEXT NOT NULL DEFAULT '',
  pdf_path TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cover_letters (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role_family TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL CHECK (source_type IN ('latex', 'text', 'pdf')),
  source_files TEXT NOT NULL DEFAULT '[]',
  editable_text TEXT NOT NULL DEFAULT '',
  pdf_path TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT '',
  job_id TEXT NOT NULL DEFAULT '',
  job_url TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  work_arrangement TEXT NOT NULL DEFAULT '',
  date_applied TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing', 'applied', 'in_process', 'success', 'learning_experience')),
  job_description TEXT NOT NULL DEFAULT '',
  resume_id TEXT NOT NULL DEFAULT '',
  cover_letter_id TEXT NOT NULL DEFAULT '',
  general_notes TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('generic', 'company')),
  company_id TEXT NOT NULL DEFAULT '',
  question_text TEXT NOT NULL,
  reusable_answer TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS application_questions (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL,
  question_id TEXT NOT NULL DEFAULT '',
  question_text TEXT NOT NULL,
  submitted_answer TEXT NOT NULL DEFAULT '',
  response_limit TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_notes (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL,
  note_type TEXT NOT NULL CHECK (note_type IN ('general', 'hr', 'hiring_manager', 'referral')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS career_entries (
  id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('career_work', 'project', 'achievement', 'skill', 'certification', 'career_story')),
  title TEXT NOT NULL,
  organization TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  detailed_description TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  technologies TEXT NOT NULL DEFAULT '',
  results_metrics TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_applications_company_id ON applications(company_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_cover_letters_company_id ON cover_letters(company_id);
CREATE INDEX IF NOT EXISTS idx_questions_company_id ON questions(company_id);
CREATE INDEX IF NOT EXISTS idx_application_questions_application_id ON application_questions(application_id);
CREATE INDEX IF NOT EXISTS idx_application_notes_application_id ON application_notes(application_id);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('current_resume_id', ''),
  ('cover_letter_template_id', ''),
  ('storage_provider', 'local'),
  ('workspace_path', ''),
  ('ai_enabled', 'false'),
  ('ai_provider', ''),
  ('s3_bucket', ''),
  ('s3_region', ''),
  ('s3_prefix', 'careertracker'),
  ('s3_endpoint', '');
