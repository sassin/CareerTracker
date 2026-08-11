import Database from "@tauri-apps/plugin-sql";
import {
  AppData,
  AppSettings,
  AiUsageRecord,
  ApplicationNote,
  ApplicationQuestion,
  CareerEntry,
  Company,
  CoverLetter,
  CoverLetterTemplate,
  JobApplication,
  Question,
  Resume,
  WorkArrangement,
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
  | "careerEntry"
  | "workArrangement";

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
  saveWorkArrangement(value: WorkArrangement): Promise<void>;
  saveAiUsage(value: AiUsageRecord): Promise<void>;
  clearAiUsage(): Promise<void>;
  saveSettings(value: AppSettings): Promise<void>;
  rebaseDocumentPaths(oldRoot: string, newRoot: string): Promise<void>;
  deleteEntity(entity: EntityName, id: string): Promise<void>;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function settingMap(rows: Array<{ key: string; value: string }>): AppSettings {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const provider = map.get("ai_provider") ?? "";
  const numberSetting = (key: string, fallback: number, min: number, max: number) => {
    const parsed = Number(map.get(key));
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  return {
    currentResumeId: map.get("current_resume_id") ?? "",
    coverLetterTemplateId: map.get("cover_letter_template_id") ?? "",
    careerProfileSummary: map.get("career_profile_summary") ?? "",
    storageMode: map.get("storage_provider") === "s3" ? "s3" : map.get("storage_provider") === "hybrid" ? "hybrid" : "local",
    workspacePath: map.get("workspace_path") ?? "",
    aiEnabled: map.get("ai_enabled") === "true",
    aiProvider: provider === "openai" || provider === "anthropic" || provider === "gemini" ? provider : "",
    aiModel: map.get("ai_model") ?? "",
    tectonicPath: map.get("tectonic_path") ?? "tectonic",
    s3Bucket: map.get("s3_bucket") ?? "",
    s3Region: map.get("s3_region") ?? "auto",
    s3Prefix: map.get("s3_prefix") ?? "careertracker",
    s3Endpoint: map.get("s3_endpoint") ?? "",
    companyDescriptionMaxWords: numberSetting("company_description_max_words", emptySettings.companyDescriptionMaxWords, 10, 500),
    companyProductsMaxWords: numberSetting("company_products_max_words", emptySettings.companyProductsMaxWords, 5, 500),
    companyIndustryMaxWords: numberSetting("company_industry_max_words", emptySettings.companyIndustryMaxWords, 1, 50),
    companyHeadquartersMaxWords: numberSetting("company_headquarters_max_words", emptySettings.companyHeadquartersMaxWords, 1, 50),
    resumeMaxGrowthPercent: numberSetting("resume_max_growth_percent", emptySettings.resumeMaxGrowthPercent, 0, 100),
    coverLetterMaxWords: numberSetting("cover_letter_max_words", emptySettings.coverLetterMaxWords, 50, 1000),
    companyDetailsSystemPrompt: map.get("company_details_system_prompt") ?? emptySettings.companyDetailsSystemPrompt,
    careerEntrySummarySystemPrompt: map.get("career_entry_summary_system_prompt") ?? emptySettings.careerEntrySummarySystemPrompt,
    careerEntryDescriptionSystemPrompt: map.get("career_entry_description_system_prompt") ?? emptySettings.careerEntryDescriptionSystemPrompt,
    careerProfileSystemPrompt: map.get("career_profile_system_prompt") ?? emptySettings.careerProfileSystemPrompt,
    resumeReviewSystemPrompt: map.get("resume_review_system_prompt") ?? emptySettings.resumeReviewSystemPrompt,
    coverLetterSystemPrompt: map.get("cover_letter_system_prompt") ?? emptySettings.coverLetterSystemPrompt,
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
      aiUserPrompt: item.aiUserPrompt ?? "",
    })),
    resumes: (value.resumes ?? []).map((item) => ({ ...item, createdAt: item.createdAt ?? "", contentHash: item.contentHash ?? "", latexText: item.latexText ?? "", pdfPath: item.pdfPath ?? "", sourceFiles: item.sourceFiles ?? [] })),
    coverLetterTemplates: (value.coverLetterTemplates ?? []).map((item) => ({ ...item, createdAt: item.createdAt ?? "", contentHash: item.contentHash ?? "", latexText: item.latexText ?? "", pdfPath: item.pdfPath ?? "", sourceFiles: item.sourceFiles ?? [] })),
    coverLetters: (value.coverLetters ?? []).map((item) => ({ ...item, createdAt: item.createdAt ?? "", contentHash: item.contentHash ?? "", latexText: item.latexText ?? "", pdfPath: item.pdfPath ?? "", sourceFiles: item.sourceFiles ?? [] })),
    questions: value.questions ?? [],
    applicationQuestions: value.applicationQuestions ?? [],
    notes: value.notes ?? [],
    careerEntries: (value.careerEntries ?? []).map((item) => ({ ...item, entrySummary: item.entrySummary ?? "" })),
    workArrangements: value.workArrangements?.length ? value.workArrangements : structuredClone(emptyData.workArrangements),
    aiUsage: value.aiUsage ?? [],
    settings: { ...emptySettings, ...(value.settings ?? {}) },
  };
}

function safeSourceFiles(value: unknown): Array<{ name: string; content: string }> {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.name === "string" && typeof item.content === "string").map((item) => ({ name: item.name, content: item.content }));
  } catch {
    return [];
  }
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
  async saveWorkArrangement(value: WorkArrangement) { this.upsert(this.data.workArrangements, value); this.data.workArrangements.sort((a,b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)); this.persist(); }
  async saveAiUsage(value: AiUsageRecord) { this.data.aiUsage.unshift(value); this.data.aiUsage = this.data.aiUsage.slice(0, 5000); this.persist(); }
  async clearAiUsage() { this.data.aiUsage = []; this.persist(); }
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
        workArrangement: "workArrangements",
      };
      const key = map[entity as Exclude<EntityName, "company" | "application">];
      (this.data[key] as Array<{ id: string }>) = (this.data[key] as Array<{ id: string }>).filter((item) => item.id !== id) as never;
    }
    this.persist();
  }

}

class TauriRepository implements Repository {
  private db: Database | null = null;
  async initialize() { this.db = await Database.load(DB_URL); }
  private get database() { if (!this.db) throw new Error("Database is not initialized."); return this.db; }

  async load(): Promise<AppData> {
    const [companies, applications, resumes, templates, letters, questions, applicationQuestions, notes, careerEntries, workArrangements, aiUsage, settings] = await Promise.all([
      this.database.select<Record<string, unknown>[]>("SELECT * FROM companies ORDER BY name COLLATE NOCASE"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM applications ORDER BY CASE WHEN date_applied='' THEN 1 ELSE 0 END, date_applied DESC, role_title COLLATE NOCASE"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM resumes ORDER BY rowid DESC"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM cover_letter_templates ORDER BY rowid DESC"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM cover_letters ORDER BY rowid DESC"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM questions ORDER BY question_text COLLATE NOCASE"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM application_questions ORDER BY rowid DESC"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM application_notes ORDER BY rowid DESC"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM career_entries ORDER BY title COLLATE NOCASE"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM work_arrangements ORDER BY sort_order, name COLLATE NOCASE"),
      this.database.select<Record<string, unknown>[]>("SELECT * FROM ai_usage ORDER BY created_at DESC, rowid DESC LIMIT 5000"),
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
        suggestedResumeText: String(row.suggested_resume_text ?? ""), selectedEvidenceJson: String(row.selected_evidence_json ?? "[]"), generalNotes: String(row.general_notes ?? ""), aiUserPrompt: String(row.ai_user_prompt ?? ""),
      })),
      resumes: resumes.map((row) => ({
        id: String(row.id ?? ""), createdAt: String(row.created_at ?? ""), name: String(row.name ?? ""), sourceType: String(row.source_type ?? "text") as Resume["sourceType"],
        editableText: String(row.editable_text ?? ""), contentHash: String(row.content_hash ?? ""), latexText: String(row.latex_text ?? ""), pdfPath: String(row.pdf_path ?? ""), notes: String(row.notes ?? ""), sourceFiles: safeSourceFiles(row.source_files),
      })),
      coverLetterTemplates: templates.map((row) => ({
        id: String(row.id ?? ""), createdAt: String(row.created_at ?? ""), name: String(row.name ?? ""), sourceType: String(row.source_type ?? "text") as CoverLetterTemplate["sourceType"],
        editableText: String(row.editable_text ?? ""), contentHash: String(row.content_hash ?? ""), latexText: String(row.latex_text ?? ""), pdfPath: String(row.pdf_path ?? ""), notes: String(row.notes ?? ""), sourceFiles: safeSourceFiles(row.source_files),
      })),
      coverLetters: letters.map((row) => ({
        id: String(row.id ?? ""), createdAt: String(row.created_at ?? ""), companyId: String(row.company_id ?? ""), name: String(row.name ?? ""), roleFamily: String(row.role_family ?? ""),
        sourceType: String(row.source_type ?? "text") as CoverLetter["sourceType"], editableText: String(row.editable_text ?? ""), contentHash: String(row.content_hash ?? ""),
        latexText: String(row.latex_text ?? ""), pdfPath: String(row.pdf_path ?? ""), notes: String(row.notes ?? ""), sourceFiles: safeSourceFiles(row.source_files),
      })),
      questions: questions.map((row) => ({ id: String(row.id ?? ""), scope: String(row.scope ?? "generic") as Question["scope"], companyId: String(row.company_id ?? ""), questionText: String(row.question_text ?? ""), reusableAnswer: String(row.reusable_answer ?? ""), notes: String(row.notes ?? "") })),
      applicationQuestions: applicationQuestions.map((row) => ({ id: String(row.id ?? ""), applicationId: String(row.application_id ?? ""), questionId: String(row.question_id ?? ""), questionText: String(row.question_text ?? ""), submittedAnswer: String(row.submitted_answer ?? ""), responseLimit: String(row.response_limit ?? "") })),
      notes: notes.map((row) => ({ id: String(row.id ?? ""), applicationId: String(row.application_id ?? ""), noteType: String(row.note_type ?? "general") as ApplicationNote["noteType"], title: String(row.title ?? ""), content: String(row.content ?? "") })),
      careerEntries: careerEntries.map((row) => ({ id: String(row.id ?? ""), category: String(row.category ?? "project") as CareerEntry["category"], title: String(row.title ?? ""), organization: String(row.organization ?? ""), entrySummary: String(row.short_description ?? ""), detailedDescription: String(row.detailed_description ?? ""), skills: String(row.skills ?? ""), technologies: String(row.technologies ?? ""), resultsMetrics: String(row.results_metrics ?? ""), notes: String(row.notes ?? "") })),
      workArrangements: workArrangements.map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? ""), sortOrder: Number(row.sort_order ?? 0) })),
      aiUsage: aiUsage.map((row) => ({ id: String(row.id ?? ""), provider: String(row.provider ?? ""), model: String(row.model ?? ""), operation: String(row.operation ?? ""), createdAt: String(row.created_at ?? ""), inputTokens: Number(row.input_tokens ?? 0), outputTokens: Number(row.output_tokens ?? 0), totalTokens: Number(row.total_tokens ?? 0), status: String(row.status ?? "success") === "failed" ? "failed" : "success", errorMessage: String(row.error_message ?? "") })),
      settings: settingMap(settings),
    };
  }

  async saveCompany(v: Company) { await this.database.execute(`INSERT INTO companies (id,name,website,short_description,industry,products_services,headquarters,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET name=$2,website=$3,short_description=$4,industry=$5,products_services=$6,headquarters=$7,notes=$8`, [v.id,v.name,v.website,v.shortDescription,v.industry,v.productsServices,v.headquarters,v.notes]); }
  async saveApplication(v: JobApplication) {
    const companyId = v.companyId || UNASSIGNED_COMPANY_ID;
    if (!v.companyId) {
      await this.database.execute("INSERT OR IGNORE INTO companies (id,name) VALUES ($1,'')", [UNASSIGNED_COMPANY_ID]);
    }
    await this.database.execute(`INSERT INTO applications (id,company_id,role_title,job_id,job_url,location,work_arrangement,date_applied,status,job_description,resume_id,cover_letter_id,resume_change_notes,ai_assessment,suggested_resume_text,selected_evidence_json,general_notes,ai_user_prompt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT(id) DO UPDATE SET company_id=$2,role_title=$3,job_id=$4,job_url=$5,location=$6,work_arrangement=$7,date_applied=$8,status=$9,job_description=$10,resume_id=$11,cover_letter_id=$12,resume_change_notes=$13,ai_assessment=$14,suggested_resume_text=$15,selected_evidence_json=$16,general_notes=$17,ai_user_prompt=$18`, [v.id,companyId,v.roleTitle,v.jobId,v.jobUrl,v.location,v.workArrangement,v.dateApplied,v.status,v.jobDescription,v.resumeId,v.coverLetterId,v.resumeChangeNotes,v.aiAssessment,v.suggestedResumeText,v.selectedEvidenceJson,v.generalNotes,v.aiUserPrompt]);
  }
  async saveResume(v: Resume) { await this.database.execute(`INSERT INTO resumes (id,name,source_type,source_files,editable_text,pdf_path,content_hash,notes,latex_text,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET name=$2,source_type=$3,source_files=$4,editable_text=$5,pdf_path=$6,content_hash=$7,notes=$8,latex_text=$9`, [v.id,v.name,v.sourceType,JSON.stringify(v.sourceFiles ?? []),v.editableText,v.pdfPath,v.contentHash,v.notes,v.latexText,v.createdAt || new Date().toISOString()]); }
  async saveCoverLetterTemplate(v: CoverLetterTemplate) { await this.database.execute(`INSERT INTO cover_letter_templates (id,name,source_type,source_files,editable_text,pdf_path,notes,content_hash,latex_text,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET name=$2,source_type=$3,source_files=$4,editable_text=$5,pdf_path=$6,notes=$7,content_hash=$8,latex_text=$9`, [v.id,v.name,v.sourceType,JSON.stringify(v.sourceFiles ?? []),v.editableText,v.pdfPath,v.notes,v.contentHash,v.latexText,v.createdAt || new Date().toISOString()]); }
  async saveCoverLetter(v: CoverLetter) { await this.database.execute(`INSERT INTO cover_letters (id,company_id,name,role_family,source_type,source_files,editable_text,pdf_path,notes,content_hash,latex_text,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(id) DO UPDATE SET company_id=$2,name=$3,role_family=$4,source_type=$5,source_files=$6,editable_text=$7,pdf_path=$8,notes=$9,content_hash=$10,latex_text=$11`, [v.id,v.companyId,v.name,v.roleFamily,v.sourceType,JSON.stringify(v.sourceFiles ?? []),v.editableText,v.pdfPath,v.notes,v.contentHash,v.latexText,v.createdAt || new Date().toISOString()]); }
  async saveQuestion(v: Question) { await this.database.execute(`INSERT INTO questions (id,scope,company_id,question_text,reusable_answer,notes) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET scope=$2,company_id=$3,question_text=$4,reusable_answer=$5,notes=$6`, [v.id,v.scope,v.companyId,v.questionText,v.reusableAnswer,v.notes]); }
  async saveApplicationQuestion(v: ApplicationQuestion) { await this.database.execute(`INSERT INTO application_questions (id,application_id,question_id,question_text,submitted_answer,response_limit) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET application_id=$2,question_id=$3,question_text=$4,submitted_answer=$5,response_limit=$6`, [v.id,v.applicationId,v.questionId,v.questionText,v.submittedAnswer,v.responseLimit]); }
  async saveNote(v: ApplicationNote) { await this.database.execute(`INSERT INTO application_notes (id,application_id,note_type,title,content) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET application_id=$2,note_type=$3,title=$4,content=$5`, [v.id,v.applicationId,v.noteType,v.title,v.content]); }
  async saveWorkArrangement(v: WorkArrangement) { await this.database.execute(`INSERT INTO work_arrangements (id,name,sort_order) VALUES ($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=$2,sort_order=$3`, [v.id,v.name,v.sortOrder]); }
  async saveCareerEntry(v: CareerEntry) { await this.database.execute(`INSERT INTO career_entries (id,category,title,organization,short_description,detailed_description,skills,technologies,results_metrics,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET category=$2,title=$3,organization=$4,short_description=$5,detailed_description=$6,skills=$7,technologies=$8,results_metrics=$9,notes=$10`, [v.id,v.category,v.title,v.organization,v.entrySummary,v.detailedDescription,v.skills,v.technologies,v.resultsMetrics,v.notes]); }
  async saveAiUsage(v: AiUsageRecord) { await this.database.execute(`INSERT INTO ai_usage (id,provider,model,operation,created_at,input_tokens,output_tokens,total_tokens,status,error_message) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [v.id,v.provider,v.model,v.operation,v.createdAt,v.inputTokens,v.outputTokens,v.totalTokens,v.status,v.errorMessage]); }
  async clearAiUsage() { await this.database.execute("DELETE FROM ai_usage"); }

  async saveSettings(v: AppSettings) {
    const rows: Array<[string,string]> = [["current_resume_id",v.currentResumeId],["cover_letter_template_id",v.coverLetterTemplateId],["career_profile_summary",v.careerProfileSummary],["storage_provider",v.storageMode],["workspace_path",v.workspacePath],["ai_enabled",String(v.aiEnabled)],["ai_provider",v.aiProvider],["ai_model",v.aiModel],["tectonic_path",v.tectonicPath],["s3_bucket",v.s3Bucket],["s3_region",v.s3Region],["s3_prefix",v.s3Prefix],["s3_endpoint",v.s3Endpoint],["company_description_max_words",String(v.companyDescriptionMaxWords)],["company_products_max_words",String(v.companyProductsMaxWords)],["company_industry_max_words",String(v.companyIndustryMaxWords)],["company_headquarters_max_words",String(v.companyHeadquartersMaxWords)],["resume_max_growth_percent",String(v.resumeMaxGrowthPercent)],["cover_letter_max_words",String(v.coverLetterMaxWords)],["company_details_system_prompt",v.companyDetailsSystemPrompt],["career_entry_summary_system_prompt",v.careerEntrySummarySystemPrompt],["career_entry_description_system_prompt",v.careerEntryDescriptionSystemPrompt],["career_profile_system_prompt",v.careerProfileSystemPrompt],["resume_review_system_prompt",v.resumeReviewSystemPrompt],["cover_letter_system_prompt",v.coverLetterSystemPrompt]];
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
    const table: Record<EntityName,string> = { company:"companies", application:"applications", resume:"resumes", coverLetterTemplate:"cover_letter_templates", coverLetter:"cover_letters", question:"questions", applicationQuestion:"application_questions", note:"application_notes", careerEntry:"career_entries", workArrangement:"work_arrangements" };
    if (entity === "company") await this.database.execute("DELETE FROM questions WHERE scope='company' AND company_id=$1", [id]);
    await this.database.execute(`DELETE FROM ${table[entity]} WHERE id=$1`, [id]);
  }

}

export function createRepository(): Repository {
  return isTauriRuntime() ? new TauriRepository() : new BrowserRepository();
}
