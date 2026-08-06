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

export const newApplication = (companyId = ""): JobApplication => ({
  id: crypto.randomUUID(),
  companyId,
  roleTitle: "",
  jobId: "",
  jobUrl: "",
  location: "",
  workArrangement: "",
  dateApplied: "",
  status: "preparing",
  jobDescription: "",
  resumeId: "",
  coverLetterId: "",
  resumeChangeNotes: "",
  aiAssessment: "",
  suggestedResumeText: "",
  selectedEvidenceJson: "[]",
  generalNotes: "",
});

export const newResume = (): Resume => ({
  id: crypto.randomUUID(),
  name: "",
  sourceType: "text",
  editableText: "",
  contentHash: "",
  latexText: "",
  pdfPath: "",
  notes: "",
});

export const newCoverLetterTemplate = (): CoverLetterTemplate => ({
  id: crypto.randomUUID(),
  name: "",
  sourceType: "text",
  editableText: "",
  contentHash: "",
  latexText: "",
  pdfPath: "",
  notes: "",
});

export const newCoverLetter = (companyId = ""): CoverLetter => ({
  id: crypto.randomUUID(),
  companyId,
  name: "",
  roleFamily: "",
  sourceType: "text",
  editableText: "",
  contentHash: "",
  latexText: "",
  pdfPath: "",
  notes: "",
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
