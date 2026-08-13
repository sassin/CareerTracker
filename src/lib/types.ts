import { DEFAULT_CAREER_ENTRY_DESCRIPTION_PROMPT, DEFAULT_CAREER_ENTRY_SUMMARY_PROMPT, DEFAULT_CAREER_PROFILE_PROMPT, DEFAULT_COMPANY_DETAILS_PROMPT, DEFAULT_COVER_LETTER_PROMPT, DEFAULT_RESUME_REVIEW_PROMPT } from "./promptDefaults";

export type ApplicationStatus =
  | "preparing"
  | "applied"
  | "in_process"
  | "success"
  | "learning_experience";

export type DocumentSourceType = "latex" | "text" | "pdf";
export type QuestionScope = "generic" | "company";
export type NoteType = "general" | "hr" | "hiring_manager" | "referral";
export type CareerEntryCategory =
  | "career_work"
  | "project"
  | "achievement"
  | "skill"
  | "certification"
  | "career_story";
export type AiProvider = "openai" | "anthropic" | "gemini" | "";
export type StorageMode = "local" | "s3" | "hybrid";

export interface DocumentSourceFile {
  name: string;
  content: string;
}

export interface WorkArrangement {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Company {
  id: string;
  name: string;
  website: string;
  shortDescription: string;
  industry: string;
  productsServices: string;
  headquarters: string;
  notes: string;
}

export interface JobApplication {
  id: string;
  companyId: string;
  roleTitle: string;
  jobId: string;
  jobUrl: string;
  location: string;
  workArrangement: string;
  dateApplied: string;
  status: ApplicationStatus;
  jobDescription: string;
  resumeId: string;
  coverLetterId: string;
  resumeChangeNotes: string;
  aiAssessment: string;
  suggestedResumeText: string;
  selectedEvidenceJson: string;
  generalNotes: string;
  aiUserPrompt: string;
}

export interface Resume {
  id: string;
  createdAt: string;
  name: string;
  sourceType: DocumentSourceType;
  editableText: string;
  contentHash: string;
  latexText: string;
  pdfPath: string;
  notes: string;
  sourceFiles: DocumentSourceFile[];
}

export interface CoverLetterTemplate {
  id: string;
  createdAt: string;
  name: string;
  sourceType: DocumentSourceType;
  editableText: string;
  contentHash: string;
  latexText: string;
  pdfPath: string;
  notes: string;
  sourceFiles: DocumentSourceFile[];
}

export interface CoverLetter {
  id: string;
  createdAt: string;
  companyId: string;
  name: string;
  roleFamily: string;
  sourceType: DocumentSourceType;
  editableText: string;
  contentHash: string;
  latexText: string;
  pdfPath: string;
  notes: string;
  sourceFiles: DocumentSourceFile[];
}

export interface Question {
  id: string;
  scope: QuestionScope;
  companyId: string;
  questionText: string;
  reusableAnswer: string;
  notes: string;
}

export interface ApplicationQuestion {
  id: string;
  applicationId: string;
  questionId: string;
  questionText: string;
  submittedAnswer: string;
  responseLimit: string;
}

export interface ApplicationNote {
  id: string;
  applicationId: string;
  noteType: NoteType;
  title: string;
  content: string;
}

export interface CareerEntry {
  id: string;
  category: CareerEntryCategory;
  title: string;
  organization: string;
  entrySummary: string;
  detailedDescription: string;
  skills: string;
  technologies: string;
  resultsMetrics: string;
  notes: string;
}

export interface AppSettings {
  currentResumeId: string;
  coverLetterTemplateId: string;
  careerProfileSummary: string;
  storageMode: StorageMode;
  workspacePath: string;
  aiEnabled: boolean;
  aiProvider: AiProvider;
  aiModel: string;
  tectonicPath: string;
  s3Bucket: string;
  s3Region: string;
  s3Prefix: string;
  s3Endpoint: string;
  companyDescriptionMaxWords: number;
  companyProductsMaxWords: number;
  companyIndustryMaxWords: number;
  companyHeadquartersMaxWords: number;
  resumeMaxGrowthPercent: number;
  coverLetterMaxWords: number;
  generatedCoverLetterIds: string[];
  companyDetailsSystemPrompt: string;
  careerEntrySummarySystemPrompt: string;
  careerEntryDescriptionSystemPrompt: string;
  careerProfileSystemPrompt: string;
  resumeReviewSystemPrompt: string;
  coverLetterSystemPrompt: string;
}


export interface AiUsageRecord {
  id: string;
  provider: string;
  model: string;
  operation: string;
  createdAt: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  status: "success" | "failed";
  errorMessage: string;
}

export interface AiUsageTotals {
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AppData {
  companies: Company[];
  applications: JobApplication[];
  resumes: Resume[];
  coverLetterTemplates: CoverLetterTemplate[];
  coverLetters: CoverLetter[];
  questions: Question[];
  applicationQuestions: ApplicationQuestion[];
  notes: ApplicationNote[];
  careerEntries: CareerEntry[];
  workArrangements: WorkArrangement[];
  aiUsage: AiUsageRecord[];
  aiUsageTotals: AiUsageTotals;
  settings: AppSettings;
}

export interface ImportedTextDocument {
  displayName: string;
  sourceType: DocumentSourceType;
  text: string;
  contentHash: string;
  sourceFiles: DocumentSourceFile[];
}

export interface EvidenceMatch {
  entryId: string;
  score: number;
  matchedTerms: string[];
}

export interface ResumeReviewResult {
  needsChanges: boolean;
  assessment: string;
  suggestedChanges: string[];
  updatedResumeText: string;
  evidenceUsed: string[];
  unsupportedRequirements: string[];
  coverLetterText: string;
}

export const emptySettings: AppSettings = {
  currentResumeId: "",
  coverLetterTemplateId: "",
  careerProfileSummary: "",
  storageMode: "local",
  workspacePath: "",
  aiEnabled: false,
  aiProvider: "",
  aiModel: "",
  tectonicPath: "tectonic",
  s3Bucket: "",
  s3Region: "auto",
  s3Prefix: "careertracker",
  s3Endpoint: "",
  companyDescriptionMaxWords: 70,
  companyProductsMaxWords: 45,
  companyIndustryMaxWords: 8,
  companyHeadquartersMaxWords: 12,
  resumeMaxGrowthPercent: 20,
  coverLetterMaxWords: 350,
  generatedCoverLetterIds: [],
  companyDetailsSystemPrompt: DEFAULT_COMPANY_DETAILS_PROMPT,
  careerEntrySummarySystemPrompt: DEFAULT_CAREER_ENTRY_SUMMARY_PROMPT,
  careerEntryDescriptionSystemPrompt: DEFAULT_CAREER_ENTRY_DESCRIPTION_PROMPT,
  careerProfileSystemPrompt: DEFAULT_CAREER_PROFILE_PROMPT,
  resumeReviewSystemPrompt: DEFAULT_RESUME_REVIEW_PROMPT,
  coverLetterSystemPrompt: DEFAULT_COVER_LETTER_PROMPT,
};

export const emptyData: AppData = {
  companies: [],
  applications: [],
  resumes: [],
  coverLetterTemplates: [],
  coverLetters: [],
  questions: [],
  applicationQuestions: [],
  notes: [],
  careerEntries: [],
  aiUsage: [],
  aiUsageTotals: { totalCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  workArrangements: [
    { id: "remote", name: "Remote", sortOrder: 10 },
    { id: "on-site", name: "On-Site", sortOrder: 20 },
    { id: "off-shore", name: "Off-Shore", sortOrder: 30 },
    { id: "hybrid", name: "Hybrid", sortOrder: 40 },
  ],
  settings: emptySettings,
};
