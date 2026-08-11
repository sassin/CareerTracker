import {
  AppData,
  ApplicationNote,
  ApplicationQuestion,
  Company,
  JobApplication,
  Question,
} from "./types";
import type { Repository } from "./repository";

export const BACKUP_FORMAT_VERSION = 1;

export interface BackupApplication extends Omit<JobApplication,
  "jobDescription" | "resumeId" | "coverLetterId" | "resumeChangeNotes" | "aiAssessment" | "suggestedResumeText" | "selectedEvidenceJson"
> {
  resumeName: string;
  resumeHash: string;
  coverLetterName: string;
  coverLetterHash: string;
}

export interface CareerTrackerBackup {
  format: "careertracker-application-backup";
  version: number;
  createdAt: string;
  companies: Company[];
  applications: BackupApplication[];
  questions: Question[];
  applicationQuestions: ApplicationQuestion[];
  notes: ApplicationNote[];
}

export interface BackupMergeResult {
  companiesAdded: number;
  applicationsAdded: number;
  applicationsSkipped: number;
  questionsAdded: number;
  resumeAssociationsRestored: number;
  resumeAssociationsUnavailable: number;
  coverLetterAssociationsRestored: number;
}

export function createApplicationBackup(data: AppData): CareerTrackerBackup {
  const resumeById = new Map(data.resumes.map((item) => [item.id, item]));
  const letterById = new Map(data.coverLetters.map((item) => [item.id, item]));

  return {
    format: "careertracker-application-backup",
    version: BACKUP_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    companies: data.companies.map((item) => ({ ...item })),
    applications: data.applications.map((item) => {
      const resume = resumeById.get(item.resumeId);
      const letter = letterById.get(item.coverLetterId);
      return {
        id: item.id,
        companyId: item.companyId,
        roleTitle: item.roleTitle,
        jobId: item.jobId,
        jobUrl: item.jobUrl,
        location: item.location,
        workArrangement: item.workArrangement,
        dateApplied: item.dateApplied,
        status: item.status,
        generalNotes: item.generalNotes,
        aiUserPrompt: item.aiUserPrompt,
        resumeName: resume?.name ?? "",
        resumeHash: resume?.contentHash ?? "",
        coverLetterName: letter?.name ?? "",
        coverLetterHash: letter?.contentHash ?? "",
      };
    }),
    questions: data.questions.map((item) => ({ ...item })),
    applicationQuestions: data.applicationQuestions.map((item) => ({ ...item })),
    notes: data.notes.map((item) => ({ ...item })),
  };
}

export function parseApplicationBackup(raw: string): CareerTrackerBackup {
  const parsed = JSON.parse(raw) as Partial<CareerTrackerBackup>;
  if (parsed.format !== "careertracker-application-backup" || parsed.version !== BACKUP_FORMAT_VERSION) {
    throw new Error("This is not a supported CareerTracker application backup.");
  }
  if (!Array.isArray(parsed.companies) || !Array.isArray(parsed.applications)) {
    throw new Error("The backup is incomplete.");
  }
  return {
    format: "careertracker-application-backup",
    version: BACKUP_FORMAT_VERSION,
    createdAt: String(parsed.createdAt ?? ""),
    companies: parsed.companies as Company[],
    applications: parsed.applications as BackupApplication[],
    questions: Array.isArray(parsed.questions) ? parsed.questions as Question[] : [],
    applicationQuestions: Array.isArray(parsed.applicationQuestions) ? parsed.applicationQuestions as ApplicationQuestion[] : [],
    notes: Array.isArray(parsed.notes) ? parsed.notes as ApplicationNote[] : [],
  };
}

export async function mergeApplicationBackup(repository: Repository, current: AppData, backup: CareerTrackerBackup): Promise<BackupMergeResult> {
  const result: BackupMergeResult = {
    companiesAdded: 0,
    applicationsAdded: 0,
    applicationsSkipped: 0,
    questionsAdded: 0,
    resumeAssociationsRestored: 0,
    resumeAssociationsUnavailable: 0,
    coverLetterAssociationsRestored: 0,
  };

  const currentCompanyIds = new Set(current.companies.map((item) => item.id));
  const currentApplicationIds = new Set(current.applications.map((item) => item.id));
  const currentQuestionIds = new Set(current.questions.map((item) => item.id));
  const resumeByHash = new Map(current.resumes.filter((item) => item.contentHash).map((item) => [item.contentHash, item]));
  const letterByCompanyAndHash = new Map(current.coverLetters.filter((item) => item.contentHash).map((item) => [`${item.companyId}\u0000${item.contentHash}`, item]));
  const importedApplicationIds = new Set<string>();

  for (const company of backup.companies) {
    if (!company.id || currentCompanyIds.has(company.id)) continue;
    await repository.saveCompany(company);
    currentCompanyIds.add(company.id);
    result.companiesAdded += 1;
  }

  for (const item of backup.applications) {
    if (!item.id || currentApplicationIds.has(item.id)) {
      result.applicationsSkipped += 1;
      continue;
    }

    let resumeId = "";
    if (item.resumeHash) {
      const resume = resumeByHash.get(item.resumeHash);
      if (resume) {
        resumeId = resume.id;
        result.resumeAssociationsRestored += 1;
      } else {
        result.resumeAssociationsUnavailable += 1;
      }
    }

    let coverLetterId = "";
    if (item.coverLetterHash && item.companyId) {
      const letter = letterByCompanyAndHash.get(`${item.companyId}\u0000${item.coverLetterHash}`);
      if (letter) {
        coverLetterId = letter.id;
        result.coverLetterAssociationsRestored += 1;
      }
    }

    await repository.saveApplication({
      id: item.id,
      companyId: item.companyId || "",
      roleTitle: item.roleTitle || "",
      jobId: item.jobId || "",
      jobUrl: item.jobUrl || "",
      location: item.location || "",
      workArrangement: item.workArrangement || "",
      dateApplied: item.dateApplied || "",
      status: item.status || "preparing",
      jobDescription: "",
      resumeId,
      coverLetterId,
      resumeChangeNotes: "",
      aiAssessment: "",
      suggestedResumeText: "",
      selectedEvidenceJson: "[]",
      generalNotes: item.generalNotes || "",
      aiUserPrompt: item.aiUserPrompt || "",
    });
    currentApplicationIds.add(item.id);
    importedApplicationIds.add(item.id);
    result.applicationsAdded += 1;
  }

  for (const question of backup.questions) {
    if (!question.id || currentQuestionIds.has(question.id)) continue;
    if (question.scope === "company" && question.companyId && !currentCompanyIds.has(question.companyId)) continue;
    await repository.saveQuestion(question);
    currentQuestionIds.add(question.id);
    result.questionsAdded += 1;
  }

  for (const answer of backup.applicationQuestions) {
    if (importedApplicationIds.has(answer.applicationId)) await repository.saveApplicationQuestion(answer);
  }
  for (const note of backup.notes) {
    if (importedApplicationIds.has(note.applicationId)) await repository.saveNote(note);
  }

  return result;
}
