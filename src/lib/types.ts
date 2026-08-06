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
export type StorageProvider = "local" | "s3";

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
}

export interface Resume {
  id: string;
  name: string;
  sourceType: DocumentSourceType;
  editableText: string;
  contentHash: string;
  latexText: string;
  pdfPath: string;
  notes: string;
}

export interface CoverLetterTemplate {
  id: string;
  name: string;
  sourceType: DocumentSourceType;
  editableText: string;
  contentHash: string;
  latexText: string;
  pdfPath: string;
  notes: string;
}

export interface CoverLetter {
  id: string;
  companyId: string;
  name: string;
  roleFamily: string;
  sourceType: DocumentSourceType;
  editableText: string;
  contentHash: string;
  latexText: string;
  pdfPath: string;
  notes: string;
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
  storageProvider: StorageProvider;
  workspacePath: string;
  aiEnabled: boolean;
  aiProvider: AiProvider;
  aiModel: string;
  tectonicPath: string;
  s3Bucket: string;
  s3Region: string;
  s3Prefix: string;
  s3Endpoint: string;
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
  settings: AppSettings;
}

export interface ImportedTextDocument {
  displayName: string;
  sourceType: DocumentSourceType;
  text: string;
  contentHash: string;
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
  storageProvider: "local",
  workspacePath: "",
  aiEnabled: false,
  aiProvider: "",
  aiModel: "",
  tectonicPath: "tectonic",
  s3Bucket: "",
  s3Region: "us-east-1",
  s3Prefix: "careertracker",
  s3Endpoint: "",
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
  settings: emptySettings,
};
