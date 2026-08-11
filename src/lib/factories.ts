import {
  ApplicationNote,
  ApplicationQuestion,
  CareerEntry,
  Company,
  CoverLetter,
  CoverLetterTemplate,
  JobApplication,
  Question,
  Resume,
} from "./types";

export const newCompany = (): Company => ({
  id: crypto.randomUUID(),
  name: "",
  website: "",
  shortDescription: "",
  industry: "",
  productsServices: "",
  headquarters: "",
  notes: "",
});

function localToday(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const newApplication = (companyId = ""): JobApplication => ({
  id: crypto.randomUUID(),
  companyId,
  roleTitle: "",
  jobId: "",
  jobUrl: "",
  location: "",
  workArrangement: "",
  dateApplied: localToday(),
  status: "preparing",
  jobDescription: "",
  resumeId: "",
  coverLetterId: "",
  resumeChangeNotes: "",
  aiAssessment: "",
  suggestedResumeText: "",
  selectedEvidenceJson: "[]",
  generalNotes: "",
  aiUserPrompt: "",
});

export const newResume = (): Resume => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  name: "",
  sourceType: "text",
  editableText: "",
  contentHash: "",
  latexText: "",
  pdfPath: "",
  notes: "",
  sourceFiles: [],
});

export const newCoverLetterTemplate = (): CoverLetterTemplate => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  name: "",
  sourceType: "text",
  editableText: "",
  contentHash: "",
  latexText: "",
  pdfPath: "",
  notes: "",
  sourceFiles: [],
});

export const newCoverLetter = (companyId = ""): CoverLetter => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  companyId,
  name: "",
  roleFamily: "",
  sourceType: "text",
  editableText: "",
  contentHash: "",
  latexText: "",
  pdfPath: "",
  notes: "",
  sourceFiles: [],
});

export const newQuestion = (): Question => ({
  id: crypto.randomUUID(),
  scope: "generic",
  companyId: "",
  questionText: "",
  reusableAnswer: "",
  notes: "",
});

export const newApplicationQuestion = (applicationId = ""): ApplicationQuestion => ({
  id: crypto.randomUUID(),
  applicationId,
  questionId: "",
  questionText: "",
  submittedAnswer: "",
  responseLimit: "",
});

export const newApplicationNote = (applicationId = ""): ApplicationNote => ({
  id: crypto.randomUUID(),
  applicationId,
  noteType: "general",
  title: "",
  content: "",
});

export const newCareerEntry = (): CareerEntry => ({
  id: crypto.randomUUID(),
  category: "project",
  title: "",
  organization: "",
  entrySummary: "",
  detailedDescription: "",
  skills: "",
  technologies: "",
  resultsMetrics: "",
  notes: "",
});
