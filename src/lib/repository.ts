import Database from "@tauri-apps/plugin-sql";
import {
  AppData,
  AppSettings,
  ApplicationNote,
  ApplicationQuestion,
  CareerEntry,
  Company,
  CoverLetter,
  CoverLetterTemplate,
  JobApplication,
  Question,
  Resume,
  emptyData,
  emptySettings,
} from "./types";

const DB_URL = "sqlite:careertracker.db";
const BROWSER_KEY = "careertracker-browser-data-v2";
const UNASSIGNED_COMPANY_ID = "__careertracker_unassigned__";

type EntityName =
  | "company"
  | "application"
  | "resume"
  | "coverLetterTemplate"
  | "coverLetter"
  | "question"
  | "applicationQuestion"
  | "note"
  | "careerEntry";

export interface Repository {
  initialize(): Promise<void>;
  load(): Promise<AppData>;
  saveCompany(value: Company): Promise<void>;
  saveApplication(value: JobApplication): Promise<void>;
  saveResume(value: Resume): Promise<void>;
  saveCoverLetterTemplate(value: CoverLetterTemplate): Promise<void>;
  saveCoverLetter(value: CoverLetter): Promise<void>;
  saveQuestion(value: Question): Promise<void>;
  saveApplicationQuestion(value: ApplicationQuestion): Promise<void>;
  saveNote(value: ApplicationNote): Promise<void>;
  saveCareerEntry(value: CareerEntry): Promise<void>;
  saveSettings(value: AppSettings): Promise<void>;
  rebaseDocumentPaths(oldRoot: string, newRoot: string): Promise<void>;
  deleteEntity(entity: EntityName, id: string): Promise<void>;
  replaceAll(data: AppData): Promise<void>;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function settingMap(rows: Array<{ key: string; value: string }>): AppSettings {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const provider = map.get("ai_provider") ?? "";
  return {
    currentResumeId: map.get("current_resume_id") ?? "",
    coverLetterTemplateId: map.get("cover_letter_template_id") ?? "",
    careerProfileSummary: map.get("career_profile_summary") ?? "",
    storageProvider: map.get("storage_provider") === "s3" ? "s3" : "local",
    workspacePath: map.get("workspace_path") ?? "",
    aiEnabled: map.get("ai_enabled") === "true",
    aiProvider: provider === "openai" || provider === "anthropic" || provider === "gemini" ? provider : "",
    aiModel: map.get("ai_model") ?? "",
    tectonicPath: map.get("tectonic_path") ?? "tectonic",
    s3Bucket: map.get("s3_bucket") ?? "",
    s3Region: map.get("s3_region") ?? "us-east-1",
    s3Prefix: map.get("s3_prefix") ?? "careertracker",
    s3Endpoint: map.get("s3_endpoint") ?? "",
  };
}

function normalizeData(value: Partial<AppData>): AppData {
  return {
    ...structuredClone(emptyData),
    ...value,
    companies: value.companies ?? [],
    applications: (value.applications ?? []).map((item) => ({
      ...item,
      resumeChangeNotes: item.resumeChangeNotes ?? "",
      aiAssessment: item.aiAssessment ?? "",
      suggestedResumeText: item.suggestedResumeText ?? "",
      selectedEvidenceJson: item.selectedEvidenceJson ?? "[]",
    })),
    resumes: (value.resumes ?? []).map((item) => ({ ...item, contentHash: item.contentHash ?? "", latexText: item.latexText ?? "", pdfPath: item.pdfPath ?? "" })),
    coverLetterTemplates: (value.coverLetterTemplates ?? []).map((item) => ({ ...item, contentHash: item.contentHash ?? "", latexText: item.latexText ?? "", pdfPath: item.pdfPath ?? "" })),
    coverLetters: (value.coverLetters ?? []).map((item) => ({ ...item, contentHash: item.contentHash ?? "", latexText: item.latexText ?? "", pdfPath: item.pdfPath ?? "" })),
    questions: value.questions ?? [],
    applicationQuestions: value.applicationQuestions ?? [],
    notes: value.notes ?? [],
    careerEntries: (value.careerEntries ?? []).map((item) => ({ ...item, entrySummary: item.entrySummary ?? "" })),
    settings: { ...emptySettings, ...(value.settings ?? {}) },
  };
}

function rebaseManagedPath(value: string, oldRoot: string, newRoot: string): string {
  if (!value.trim()) return value;
  const trimEnd = (input: string) => input.replace(/[\\/]+$/, "");
  const oldBase = trimEnd(oldRoot.trim());
  const newBase = trimEnd(newRoot.trim());
  if (!oldBase || !newBase) return value;
  const normalizedValue = value.replace(/\\/g, "/");
  const normalizedOld = oldBase.replace(/\\/g, "/");
  const lowerValue = normalizedValue.toLowerCase();
  const lowerOld = normalizedOld.toLowerCase();
  if (lowerValue !== lowerOld && !lowerValue.startsWith(`${lowerOld}/`)) return value;
  const relative = normalizedValue.slice(normalizedOld.length).replace(/^\/+/, "");
  const separator = newBase.includes("\\") ? "\\" : "/";
  return relative ? `${newBase}${separator}${relative.replace(/\//g, separator)}` : newBase;
}

class BrowserRepository implements Repository {
  private data: AppData = structuredClone(emptyData);

  async initialize() {
    try {
      this.data = normalizeData(JSON.parse(localStorage.getItem(BROWSER_KEY) ?? "{}"));
    } catch {
      this.data = structuredClone(emptyData);
    }
    this.persist();
  }

  private persist() {
    localStorage.setItem(BROWSER_KEY, JSON.stringify(this.data));
  }

  private upsert<T extends { id: string }>(collection: T[], value: T) {
    const index = collection.findIndex((item) => item.id === value.id);
    if (index >= 0) collection[index] = value;
    else collection.unshift(value);
    this.persist();
  }

  async load() { return structuredClone(this.data); }
  async saveCompany(value: Company) { this.upsert(this.data.companies, value); }
  async saveApplication(value: JobApplication) { this.upsert(this.data.applications, value); }
  async saveResume(value: Resume) { this.upsert(this.data.resumes, value); }
  async saveCoverLetterTemplate(value: CoverLetterTemplate) { this.upsert(this.data.coverLetterTemplates, value); }
  async saveCoverLetter(value: CoverLetter) { this.upsert(this.data.coverLetters, value); }
  async saveQuestion(value: Question) { this.upsert(this.data.questions, value); }
  async saveApplicationQuestion(value: ApplicationQuestion) { this.upsert(this.data.applicationQuestions, value); }
  async saveNote(value: ApplicationNote) { this.upsert(this.data.notes, value); }
  async saveCareerEntry(value: CareerEntry) { this.upsert(this.data.careerEntries, value); }
  async saveSettings(value: AppSettings) { this.data.settings = value; this.persist(); }

  async rebaseDocumentPaths(oldRoot: string, newRoot: string) {
    this.data.resumes = this.data.resumes.map((item) => ({ ...item, pdfPath: rebaseManagedPath(item.pdfPath, oldRoot, newRoot) }));
    this.data.coverLetterTemplates = this.data.coverLetterTemplates.map((item) => ({ ...item, pdfPath: rebaseManagedPath(item.pdfPath, oldRoot, newRoot) }));
    this.data.coverLetters = this.data.coverLetters.map((item) => ({ ...item, pdfPath: rebaseManagedPath(item.pdfPath, oldRoot, newRoot) }));
    this.persist();
  }

  async deleteEntity(entity: EntityName, id: string) {
    if (entity === "company") {
      const applicationIds = new Set(this.data.applications.filter((item) => item.companyId === id).map((item) => item.id));
      this.data.companies = this.data.companies.filter((item) => item.id !== id);
      this.data.applications = this.data.applications.filter((item) => item.companyId !== id);
      this.data.coverLetters = this.data.coverLetters.filter((item) => item.companyId !== id);
      this.data.questions = this.data.questions.filter((item) => !(item.scope === "company" && item.companyId === id));
      this.data.applicationQuestions = this.data.applicationQuestions.filter((item) => !applicationIds.has(item.applicationId));
      this.data.notes = this.data.notes.filter((item) => !applicationIds.has(item.applicationId));
    } else if (entity === "application") {
      this.data.applications = this.data.applications.filter((item) => item.id !== id);
      this.data.applicationQuestions = this.data.applicationQuestions.filter((item) => item.applicationId !== id);
      this.data.notes = this.data.notes.filter((item) => item.applicationId !== id);
    } else {
      const map: Record<Exclude<EntityName, "company" | "application">, keyof AppData> = {
        resume: "resumes",
        coverLetterTemplate: "coverLetterTemplates",
        coverLetter: "coverLetters",
        question: "questions",
        applicationQuestion: "applicationQuestions",
        note: "notes",
        careerEntry: "careerEntries",
      };
      const key = map[entity as Exclude<EntityName, "company" | "application">];
      (this.data[key] as Array<{ id: string }>) = (this.data[key] as Array<{ id: string }>).filter((item) => item.id !== id) as never;
    }
    this.persist();
  }

  async replaceAll(data: AppData) { this.data = normalizeData(data); this.persist(); }
}

class TauriRepository implements Repository {
  private db: Database | null = null;
  async initialize() { this.db = await Database.load(DB_URL); }
  private get database() { if (!this.db) throw new Error("Database is not initialized."); return this.db; }

  async load(): Promise<AppData> {
    const [companies, applications, resumes, templates, letters, questions, applicationQuestions, notes, careerEntries, settings] = await Promise.all([
      this.database.select<Record<string, unknown>[]>("SELECT * FROM companies ORDER BY name COLLATE NOCASE"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM applications ORDER BY CASE WHEN date_applied='' THEN 1 ELSE 0 END, date_applied DESC, role_title COLLATE NOCASE"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM resumes ORDER BY rowid DESC"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM cover_letter_templates ORDER BY rowid DESC"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM cover_letters ORDER BY rowid DESC"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM questions ORDER BY question_text COLLATE NOCASE"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM application_questions ORDER BY rowid DESC"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM application_notes ORDER BY rowid DESC"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM career_entries ORDER BY title COLLATE NOCASE"),
      this.database.select<Array<{ key: string; value: string }>>("SELECT key, value FROM settings"),
    ]);

    return {
      companies: companies.filter((row) => String(row.id ?? "") !== UNASSIGNED_COMPANY_ID).map((row) => ({
        id: String(row.id ?? ""), name: String(row.name ?? ""), website: String(row.website ?? ""), shortDescription: String(row.short_description ?? ""),
        industry: String(row.industry ?? ""), productsServices: String(row.products_services ?? ""), headquarters: String(row.headquarters ?? ""), notes: String(row.notes ?? ""),
      })),
      applications: applications.map((row) => ({
        id: String(row.id ?? ""), companyId: String(row.company_id ?? "") === UNASSIGNED_COMPANY_ID ? "" : String(row.company_id ?? ""), roleTitle: String(row.role_title ?? ""), jobId: String(row.job_id ?? ""),
        jobUrl: String(row.job_url ?? ""), location: String(row.location ?? ""), workArrangement: String(row.work_arrangement ?? ""), dateApplied: String(row.date_applied ?? ""),
        status: String(row.status ?? "preparing") as JobApplication["status"], jobDescription: String(row.job_description ?? ""), resumeId: String(row.resume_id ?? ""),
        coverLetterId: String(row.cover_letter_id ?? ""), resumeChangeNotes: String(row.resume_change_notes ?? ""), aiAssessment: String(row.ai_assessment ?? ""),
        suggestedResumeText: String(row.suggested_resume_text ?? ""), selectedEvidenceJson: String(row.selected_evidence_json ?? "[]"), generalNotes: String(row.general_notes ?? ""),
      })),
      resumes: resumes.map((row) => ({
        id: String(row.id ?? ""), name: String(row.name ?? ""), sourceType: String(row.source_type ?? "text") as Resume["sourceType"],
        editableText: String(row.editable_text ?? ""), contentHash: String(row.content_hash ?? ""), latexText: String(row.latex_text ?? ""), pdfPath: String(row.pdf_path ?? ""), notes: String(row.notes ?? ""),
      })),
      coverLetterTemplates: templates.map((row) => ({
        id: String(row.id ?? ""), name: String(row.name ?? ""), sourceType: String(row.source_type ?? "text") as CoverLetterTemplate["sourceType"],
        editableText: String(row.editable_text ?? ""), contentHash: String(row.content_hash ?? ""), latexText: String(row.latex_text ?? ""), pdfPath: String(row.pdf_path ?? ""), notes: String(row.notes ?? ""),
      })),
      coverLetters: letters.map((row) => ({
        id: String(row.id ?? ""), companyId: String(row.company_id ?? ""), name: String(row.name ?? ""), roleFamily: String(row.role_family ?? ""),
        sourceType: String(row.source_type ?? "text") as CoverLetter["sourceType"], editableText: String(row.editable_text ?? ""), contentHash: String(row.content_hash ?? ""),
        latexText: String(row.latex_text ?? ""), pdfPath: String(row.pdf_path ?? ""), notes: String(row.notes ?? ""),
      })),
      questions: questions.map((row) => ({ id: String(row.id ?? ""), scope: String(row.scope ?? "generic") as Question["scope"], companyId: String(row.company_id ?? ""), questionText: String(row.question_text ?? ""), reusableAnswer: String(row.reusable_answer ?? ""), notes: String(row.notes ?? "") })),
      applicationQuestions: applicationQuestions.map((row) => ({ id: String(row.id ?? ""), applicationId: String(row.application_id ?? ""), questionId: String(row.question_id ?? ""), questionText: String(row.question_text ?? ""), submittedAnswer: String(row.submitted_answer ?? ""), responseLimit: String(row.response_limit ?? "") })),
      notes: notes.map((row) => ({ id: String(row.id ?? ""), applicationId: String(row.application_id ?? ""), noteType: String(row.note_type ?? "general") as ApplicationNote["noteType"], title: String(row.title ?? ""), content: String(row.content ?? "") })),
      careerEntries: careerEntries.map((row) => ({ id: String(row.id ?? ""), category: String(row.category ?? "project") as CareerEntry["category"], title: String(row.title ?? ""), organization: String(row.organization ?? ""), entrySummary: String(row.short_description ?? ""), detailedDescription: String(row.detailed_description ?? ""), skills: String(row.skills ?? ""), technologies: String(row.technologies ?? ""), resultsMetrics: String(row.results_metrics ?? ""), notes: String(row.notes ?? "") })),
      settings: settingMap(settings),
    };
  }

  async saveCompany(v: Company) { await this.database.execute(`INSERT INTO companies (id,name,website,short_description,industry,products_services,headquarters,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=$2,website=$3,short_description=$4,industry=$5,products_services=$6,headquarters=$7,notes=$8`, [v.id,v.name,v.website,v.shortDescription,v.industry,v.productsServices,v.headquarters,v.notes]); }
  async saveApplication(v: JobApplication) {
    const companyId = v.companyId || UNASSIGNED_COMPANY_ID;
    if (!v.companyId) {
      await this.database.execute("INSERT OR IGNORE INTO companies (id,name) VALUES ($1,'')", [UNASSIGNED_COMPANY_ID]);
    }
    await this.database.execute(`INSERT INTO applications (id,company_id,role_title,job_id,job_url,location,work_arrangement,date_applied,status,job_description,resume_id,cover_letter_id,resume_change_notes,ai_assessment,suggested_resume_text,selected_evidence_json,general_notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT(id) DO UPDATE SET company_id=$2,role_title=$3,job_id=$4,job_url=$5,location=$6,work_arrangement=$7,date_applied=$8,status=$9,job_description=$10,resume_id=$11,cover_letter_id=$12,resume_change_notes=$13,ai_assessment=$14,suggested_resume_text=$15,selected_evidence_json=$16,general_notes=$17`, [v.id,companyId,v.roleTitle,v.jobId,v.jobUrl,v.location,v.workArrangement,v.dateApplied,v.status,v.jobDescription,v.resumeId,v.coverLetterId,v.resumeChangeNotes,v.aiAssessment,v.suggestedResumeText,v.selectedEvidenceJson,v.generalNotes]);
  }
  async saveResume(v: Resume) { await this.database.execute(`INSERT INTO resumes (id,name,source_type,source_files,editable_text,pdf_path,content_hash,notes,latex_text) VALUES ($1,$2,$3,'[]',$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=$2,source_type=$3,editable_text=$4,pdf_path=$5,content_hash=$6,notes=$7,latex_text=$8`, [v.id,v.name,v.sourceType,v.editableText,v.pdfPath,v.contentHash,v.notes,v.latexText]); }
  async saveCoverLetterTemplate(v: CoverLetterTemplate) { await this.database.execute(`INSERT INTO cover_letter_templates (id,name,source_type,source_files,editable_text,pdf_path,notes,content_hash,latex_text) VALUES ($1,$2,$3,'[]',$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=$2,source_type=$3,editable_text=$4,pdf_path=$5,notes=$6,content_hash=$7,latex_text=$8`, [v.id,v.name,v.sourceType,v.editableText,v.pdfPath,v.notes,v.contentHash,v.latexText]); }
  async saveCoverLetter(v: CoverLetter) { await this.database.execute(`INSERT INTO cover_letters (id,company_id,name,role_family,source_type,source_files,editable_text,pdf_path,notes,content_hash,latex_text) VALUES ($1,$2,$3,$4,$5,'[]',$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET company_id=$2,name=$3,role_family=$4,source_type=$5,editable_text=$6,pdf_path=$7,notes=$8,content_hash=$9,latex_text=$10`, [v.id,v.companyId,v.name,v.roleFamily,v.sourceType,v.editableText,v.pdfPath,v.notes,v.contentHash,v.latexText]); }
  async saveQuestion(v: Question) { await this.database.execute(`INSERT INTO questions (id,scope,company_id,question_text,reusable_answer,notes) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET scope=$2,company_id=$3,question_text=$4,reusable_answer=$5,notes=$6`, [v.id,v.scope,v.companyId,v.questionText,v.reusableAnswer,v.notes]); }
  async saveApplicationQuestion(v: ApplicationQuestion) { await this.database.execute(`INSERT INTO application_questions (id,application_id,question_id,question_text,submitted_answer,response_limit) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET application_id=$2,question_id=$3,question_text=$4,submitted_answer=$5,response_limit=$6`, [v.id,v.applicationId,v.questionId,v.questionText,v.submittedAnswer,v.responseLimit]); }
  async saveNote(v: ApplicationNote) { await this.database.execute(`INSERT INTO application_notes (id,application_id,note_type,title,content) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET application_id=$2,note_type=$3,title=$4,content=$5`, [v.id,v.applicationId,v.noteType,v.title,v.content]); }
  async saveCareerEntry(v: CareerEntry) { await this.database.execute(`INSERT INTO career_entries (id,category,title,organization,short_description,detailed_description,skills,technologies,results_metrics,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET category=$2,title=$3,organization=$4,short_description=$5,detailed_description=$6,skills=$7,technologies=$8,results_metrics=$9,notes=$10`, [v.id,v.category,v.title,v.organization,v.entrySummary,v.detailedDescription,v.skills,v.technologies,v.resultsMetrics,v.notes]); }

  async saveSettings(v: AppSettings) {
    const rows: Array<[string,string]> = [["current_resume_id",v.currentResumeId],["cover_letter_template_id",v.coverLetterTemplateId],["career_profile_summary",v.careerProfileSummary],["storage_provider",v.storageProvider],["workspace_path",v.workspacePath],["ai_enabled",String(v.aiEnabled)],["ai_provider",v.aiProvider],["ai_model",v.aiModel],["tectonic_path",v.tectonicPath],["s3_bucket",v.s3Bucket],["s3_region",v.s3Region],["s3_prefix",v.s3Prefix],["s3_endpoint",v.s3Endpoint]];
    for (const [key,value] of rows) await this.database.execute("INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2", [key,value]);
  }

  async rebaseDocumentPaths(oldRoot: string, newRoot: string) {
    const data = await this.load();
    for (const item of data.resumes) {
      const pdfPath = rebaseManagedPath(item.pdfPath, oldRoot, newRoot);
      if (pdfPath !== item.pdfPath) await this.saveResume({ ...item, pdfPath });
    }
    for (const item of data.coverLetterTemplates) {
      const pdfPath = rebaseManagedPath(item.pdfPath, oldRoot, newRoot);
      if (pdfPath !== item.pdfPath) await this.saveCoverLetterTemplate({ ...item, pdfPath });
    }
    for (const item of data.coverLetters) {
      const pdfPath = rebaseManagedPath(item.pdfPath, oldRoot, newRoot);
      if (pdfPath !== item.pdfPath) await this.saveCoverLetter({ ...item, pdfPath });
    }
  }

  async deleteEntity(entity: EntityName, id: string) {
    const table: Record<EntityName,string> = { company:"companies", application:"applications", resume:"resumes", coverLetterTemplate:"cover_letter_templates", coverLetter:"cover_letters", question:"questions", applicationQuestion:"application_questions", note:"application_notes", careerEntry:"career_entries" };
    if (entity === "company") await this.database.execute("DELETE FROM questions WHERE scope='company' AND company_id=$1", [id]);
    await this.database.execute(`DELETE FROM ${table[entity]} WHERE id=$1`, [id]);
  }

  async replaceAll(data: AppData) {
    await this.database.execute("PRAGMA foreign_keys=OFF");
    try {
      for (const table of ["application_questions","application_notes","applications","cover_letters","questions","career_entries","cover_letter_templates","resumes","companies","settings"]) await this.database.execute(`DELETE FROM ${table}`);
      for (const item of data.companies) await this.saveCompany(item);
      for (const item of data.resumes) await this.saveResume(item);
      for (const item of data.coverLetterTemplates) await this.saveCoverLetterTemplate(item);
      for (const item of data.coverLetters) await this.saveCoverLetter(item);
      for (const item of data.applications) await this.saveApplication(item);
      for (const item of data.questions) await this.saveQuestion(item);
      for (const item of data.applicationQuestions) await this.saveApplicationQuestion(item);
      for (const item of data.notes) await this.saveNote(item);
      for (const item of data.careerEntries) await this.saveCareerEntry(item);
      await this.saveSettings(data.settings);
    } finally {
      await this.database.execute("PRAGMA foreign_keys=ON");
    }
  }
}

export function createRepository(): Repository {
  return isTauriRuntime() ? new TauriRepository() : new BrowserRepository();
}
