import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import { Icon } from "./components/Icons";
import { Modal } from "./components/Modal";
import {
  CAREER_ENTRY_SUMMARY_MAX_WORDS,
  CAREER_PROFILE_MAX_WORDS,
  careerEntryDescriptionPrompt,
  careerEntrySummaryPrompt,
  careerProfilePrompt,
  companyProfilePrompt,
  coverLetterPrompt,
  countWords,
  limitWords,
  normalizeResumeReview,
  parseJsonObject,
  resumeReviewPrompt,
} from "./lib/ai";
import { DEFAULT_CAREER_ENTRY_DESCRIPTION_PROMPT, DEFAULT_CAREER_ENTRY_SUMMARY_PROMPT, DEFAULT_CAREER_PROFILE_PROMPT, DEFAULT_COMPANY_DETAILS_PROMPT, DEFAULT_COVER_LETTER_PROMPT, DEFAULT_RESUME_REVIEW_PROMPT } from "./lib/promptDefaults";
import {
  newApplication,
  newApplicationNote,
  newApplicationQuestion,
  newCareerEntry,
  newCompany,
  newCoverLetter,
  newCoverLetterTemplate,
  newQuestion,
  newResume,
} from "./lib/factories";
import { scoreCareerEntries } from "./lib/matching";
import {
  aiComplete,
  chooseBackupFile,
  chooseBackupSavePath,
  chooseCoverLetterPdfSavePath,
  chooseDocument,
  chooseResumeSourceFiles,
  chooseFolder,
  clearDiagnostics,
  deleteS3Object,
  exportCoverLetterPdf,
  diagnosticsLogDir,
  deleteSecret,
  getS3TextObject,
  hashTextContent,
  hasSecret,
  hasS3CredentialPair,
  saveS3CredentialPair,
  importResumeSource,
  importTextDocument,
  listS3Backups,
  logClientEvent,
  migrateWorkspace,
  openLocalPath,
  putS3TextObject,
  readBackup,
  readRecentDiagnostics,
  readS3Backup,
  saveSecret,
  testAi,
  testS3,
  writeLocalBackup,
  writeS3Backup,
} from "./lib/native";
import { createApplicationBackup, mergeApplicationBackup, parseApplicationBackup } from "./lib/backup";
import { createRepository } from "./lib/repository";
import {
  AiProvider,
  AppData,
  ApplicationNote,
  ApplicationQuestion,
  ApplicationStatus,
  AiUsageRecord,
  CareerEntry,
  CareerEntryCategory,
  Company,
  CoverLetter,
  CoverLetterTemplate,
  JobApplication,
  Question,
  Resume,
  ResumeReviewResult,
  emptyData,
} from "./lib/types";

const repository = createRepository();
const CURRENT_RESUME_S3_KEY = "state/current-resume.json";
const COVER_LETTER_FORMAT_S3_KEY = "state/cover-letter-format.json";

type View = "overview" | "applications" | "companies" | "documents" | "questions" | "library" | "settings";
type ModalName = "company" | "application" | "resume" | "template" | "letter" | "question" | "career" | "applicationQuestion" | "note" | null;

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "applications", label: "Roles", icon: "applications" },
  { id: "companies", label: "Companies", icon: "companies" },
  { id: "documents", label: "Documents", icon: "documents" },
  { id: "questions", label: "Questions", icon: "questions" },
  { id: "library", label: "Career Library", icon: "library" },
  { id: "settings", label: "Settings", icon: "settings" },
];

const statusMeta: Record<ApplicationStatus, { label: string; className: string }> = {
  preparing: { label: "Preparing", className: "status-preparing" },
  applied: { label: "Applied", className: "status-applied" },
  in_process: { label: "In Process", className: "status-process" },
  success: { label: "Success", className: "status-success" },
  learning_experience: { label: "Learning Experience", className: "status-learning" },
};

const overviewStatuses: ApplicationStatus[] = ["preparing", "applied", "in_process", "learning_experience"];

function companyName(data: AppData, companyId: string) {
  return data.companies.find((company) => company.id === companyId)?.name || "Company not selected";
}

function resumeName(data: AppData, resumeId: string) {
  return data.resumes.find((resume) => resume.id === resumeId)?.name || "Not selected";
}

function formatDate(value: string) {
  if (!value) return "Not recorded";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function currentResume(data: AppData) {
  return data.resumes.find((resume) => resume.id === data.settings.currentResumeId);
}

function currentTemplate(data: AppData) {
  return data.coverLetterTemplates.find((template) => template.id === data.settings.coverLetterTemplateId);
}

function updatedResumeSourceFiles(resume: Resume | undefined, text: string) {
  if (!resume || resume.sourceType !== "latex" || !resume.sourceFiles.length) return [];
  let replaced = false;
  return resume.sourceFiles.map((file) => {
    if (!replaced && file.name.toLowerCase().endsWith(".tex")) {
      replaced = true;
      return { ...file, content: text };
    }
    return file;
  });
}

function usesS3(data: AppData | { settings: AppData["settings"] }) {
  return data.settings.storageMode === "s3" || data.settings.storageMode === "hybrid";
}

function aiSettingsReady(settings: AppData["settings"]) {
  return settings.aiEnabled && Boolean(settings.aiProvider) && Boolean(settings.aiModel.trim());
}

export default function App() {
  const [data, setData] = useState<AppData>(emptyData);
  const [view, setView] = useState<View>("overview");
  const [modal, setModal] = useState<ModalName>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [settingsDirty, setSettingsDirty] = useState(false);

  const [companyDraft, setCompanyDraft] = useState<Company>(newCompany());
  const [applicationDraft, setApplicationDraft] = useState<JobApplication>(newApplication());
  const [resumeDraft, setResumeDraft] = useState<Resume>(newResume());
  const [templateDraft, setTemplateDraft] = useState<CoverLetterTemplate>(newCoverLetterTemplate());
  const [letterDraft, setLetterDraft] = useState<CoverLetter>(newCoverLetter());
  const [questionDraft, setQuestionDraft] = useState<Question>(newQuestion());
  const [careerDraft, setCareerDraft] = useState<CareerEntry>(newCareerEntry());
  const [applicationQuestionDraft, setApplicationQuestionDraft] = useState<ApplicationQuestion>(newApplicationQuestion());
  const [noteDraft, setNoteDraft] = useState<ApplicationNote>(newApplicationNote());
  const [returnToApplication, setReturnToApplication] = useState(false);

  const reload = async () => setData(await repository.load());

  useEffect(() => {
    async function initialize() {
      await repository.initialize();
      let initial = await repository.load();
      if (usesS3(initial)) {
        const s3Stored = await hasS3CredentialPair();
        if (s3Stored) {
          if (initial.settings.currentResumeId && !initial.resumes.some((item) => item.id === initial.settings.currentResumeId)) {
            try {
              const resume = JSON.parse(await getS3TextObject(initial.settings, CURRENT_RESUME_S3_KEY)) as Resume;
              if (resume?.id && resume.editableText) await repository.saveResume(resume);
            } catch {
              // A cloud fallback is best-effort; the rest of the application should still open.
            }
          }
          if (initial.settings.coverLetterTemplateId && !initial.coverLetterTemplates.some((item) => item.id === initial.settings.coverLetterTemplateId)) {
            try {
              const template = JSON.parse(await getS3TextObject(initial.settings, COVER_LETTER_FORMAT_S3_KEY)) as CoverLetterTemplate;
              if (template?.id && template.editableText) await repository.saveCoverLetterTemplate(template);
            } catch {
              // A cloud fallback is best-effort; the rest of the application should still open.
            }
          }
          initial = await repository.load();
        }
      }
      setData(initial);
    }
    initialize().catch((reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      void logClientEvent("error", "ui.initialize", message);
      setError(message);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      const message = event.error instanceof Error ? event.error.message : event.message;
      void logClientEvent("error", "ui.window_error", message || "Unknown window error");
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
      void logClientEvent("error", "ui.unhandled_rejection", message);
    };
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const closeGuardRef = useRef({ busy, modal, settingsDirty });

  useEffect(() => {
    closeGuardRef.current = { busy, modal, settingsDirty };
  }, [busy, modal, settingsDirty]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    const appWindow = getCurrentWindow();

    void appWindow.onCloseRequested(async (event) => {
      const state = closeGuardRef.current;
      if (!state.busy && state.modal === null && !state.settingsDirty) return;

      event.preventDefault();
      const message = state.busy
        ? "An operation is still running. Close CareerTracker anyway?"
        : "You have an open edit or unsaved Settings changes. Close CareerTracker anyway?";
      const confirmed = await confirm(message, { title: "CareerTracker", kind: "warning" });
      if (confirmed) await appWindow.destroy();
    }).then((value) => {
      if (active) unlisten = value;
      else value();
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      void logClientEvent("error", "ui.action", message);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function trackedAiComplete(operation: string, prompt: string): Promise<string> {
    const provider = data.settings.aiProvider;
    const model = data.settings.aiModel;
    const base: AiUsageRecord = { id: crypto.randomUUID(), provider, model, operation, createdAt: new Date().toISOString(), inputTokens: 0, outputTokens: 0, totalTokens: 0, status: "success", errorMessage: "" };
    try {
      const result = await aiComplete(provider, model, prompt);
      const record = { ...base, inputTokens: result.inputTokens, outputTokens: result.outputTokens, totalTokens: result.totalTokens };
      await repository.saveAiUsage(record);
      setData((current) => ({
        ...current,
        aiUsage: [record, ...current.aiUsage].slice(0, 10),
        aiUsageTotals: {
          totalCalls: current.aiUsageTotals.totalCalls + 1,
          inputTokens: current.aiUsageTotals.inputTokens + record.inputTokens,
          outputTokens: current.aiUsageTotals.outputTokens + record.outputTokens,
          totalTokens: current.aiUsageTotals.totalTokens + record.totalTokens,
        },
      }));
      return result.text;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      const record = { ...base, status: "failed" as const, errorMessage: message.slice(0, 500) };
      const stored = await repository.saveAiUsage(record).then(() => true).catch(() => false);
      if (stored) {
        setData((current) => ({
          ...current,
          aiUsage: [record, ...current.aiUsage].slice(0, 10),
          aiUsageTotals: {
            totalCalls: current.aiUsageTotals.totalCalls + 1,
            inputTokens: current.aiUsageTotals.inputTokens + record.inputTokens,
            outputTokens: current.aiUsageTotals.outputTokens + record.outputTokens,
            totalTokens: current.aiUsageTotals.totalTokens + record.totalTokens,
          },
        }));
      }
      throw reason;
    }
  }

  async function saveRemoteSnapshot(key: string, value: unknown, settings = data.settings) {
    if (settings.storageMode === "local") return "";
    if (!(await hasS3CredentialPair())) return "S3 credentials are not configured.";
    try {
      await putS3TextObject(settings, key, JSON.stringify(value));
      return "";
    } catch (reason) {
      return reason instanceof Error ? reason.message : String(reason);
    }
  }

  async function deleteRemoteSnapshot(key: string, settings = data.settings) {
    if (settings.storageMode === "local") return "";
    if (!(await hasS3CredentialPair())) return "";
    try {
      await deleteS3Object(settings, key);
      return "";
    } catch (reason) {
      return reason instanceof Error ? reason.message : String(reason);
    }
  }

  async function cleanupOrphanResumes(resumeIds: string[]) {
    let snapshot = await repository.load();
    for (const id of [...new Set(resumeIds.filter(Boolean))]) {
      if (id === snapshot.settings.currentResumeId) continue;
      if (snapshot.applications.some((item) => item.resumeId === id)) continue;
      await repository.deleteEntity("resume", id);
      snapshot = await repository.load();
    }
  }

  function openCompany(company?: Company) {
    setCompanyDraft(company ? { ...company } : newCompany());
    setModal("company");
  }

  function openApplication(application?: JobApplication, companyId = "") {
    setApplicationDraft(application ? { ...application } : newApplication(companyId));
    setModal("application");
  }

  function openResume(resume?: Resume, fromApplication = false) {
    setReturnToApplication(fromApplication);
    setResumeDraft(resume ? { ...resume } : newResume());
    setModal("resume");
  }

  function openTemplate(template?: CoverLetterTemplate) {
    setTemplateDraft(template ? { ...template } : newCoverLetterTemplate());
    setModal("template");
  }

  function openLetter(letter?: CoverLetter, companyId = "", fromApplication = false) {
    setReturnToApplication(fromApplication);
    setLetterDraft(letter ? { ...letter } : newCoverLetter(companyId));
    setModal("letter");
  }

  async function saveCompany(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!companyDraft.name.trim()) throw new Error("Enter a company name.");
      await repository.saveCompany({ ...companyDraft, name: companyDraft.name.trim() });
      await reload();
      setModal(null);
      setNotice("Company saved.");
    });
  }

  async function saveApplication(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await repository.saveApplication(applicationDraft);
      await reload();
      setModal(null);
      setNotice("Role saved.");
    });
  }

  async function saveResume(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!resumeDraft.name.trim()) throw new Error("Enter a resume name.");
      if (!resumeDraft.editableText.trim()) throw new Error("Resume text is required.");
      const contentHash = await hashTextContent(resumeDraft.editableText);
      const duplicate = data.resumes.find((item) => item.contentHash === contentHash && item.id !== resumeDraft.id);
      if (duplicate) throw new Error(`This resume already exists as “${duplicate.name}”.`);
      const saved = { ...resumeDraft, contentHash };
      await repository.saveResume(saved);
      const cloudError = data.settings.currentResumeId === saved.id ? await saveRemoteSnapshot(CURRENT_RESUME_S3_KEY, saved) : "";
      await reload();
      setModal(returnToApplication ? "application" : null);
      setReturnToApplication(false);
      setNotice("Resume saved.");
      if (cloudError) setError(`Resume saved locally. Cloud snapshot failed: ${cloudError}`);
    });
  }

  async function saveTemplate(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!templateDraft.name.trim()) throw new Error("Enter a format name.");
      if (!templateDraft.editableText.trim()) throw new Error("Cover letter sample text is required.");
      const contentHash = await hashTextContent(templateDraft.editableText);
      const duplicate = data.coverLetterTemplates.find((item) => item.contentHash === contentHash && item.id !== templateDraft.id);
      if (duplicate) throw new Error(`This cover letter format already exists as “${duplicate.name}”.`);
      const saved = { ...templateDraft, contentHash };
      await repository.saveCoverLetterTemplate(saved);
      const cloudError = data.settings.coverLetterTemplateId === saved.id ? await saveRemoteSnapshot(COVER_LETTER_FORMAT_S3_KEY, saved) : "";
      await reload();
      setModal(null);
      setNotice("Cover letter format saved.");
      if (cloudError) setError(`Cover letter format saved locally. Cloud snapshot failed: ${cloudError}`);
    });
  }

  async function saveLetter(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!letterDraft.companyId) throw new Error("Select a company for this cover letter.");
      if (!letterDraft.name.trim()) throw new Error("Enter a cover letter name.");
      if (!letterDraft.editableText.trim()) throw new Error("Cover letter text is required.");
      const contentHash = await hashTextContent(letterDraft.editableText);
      const duplicate = data.coverLetters.find((item) => item.companyId === letterDraft.companyId && item.contentHash === contentHash && item.id !== letterDraft.id);
      if (duplicate) throw new Error(`This company already has the same cover letter as “${duplicate.name}”.`);
      await repository.saveCoverLetter({ ...letterDraft, contentHash });
      await reload();
      setModal(returnToApplication ? "application" : null);
      setReturnToApplication(false);
      setNotice("Cover letter saved.");
    });
  }

  async function saveQuestion(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!questionDraft.questionText.trim()) throw new Error("Enter the question.");
      if (questionDraft.scope === "company" && !questionDraft.companyId) throw new Error("Select a company scope.");
      await repository.saveQuestion(questionDraft);
      await reload();
      setModal(null);
      setNotice("Question saved.");
    });
  }

  async function saveCareer(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!careerDraft.title.trim()) throw new Error("Enter a title.");
      await repository.saveCareerEntry(careerDraft);
      await reload();
      setModal(null);
      setNotice("Career entry saved.");
    });
  }

  async function saveApplicationQuestion(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!applicationQuestionDraft.questionText.trim()) throw new Error("Enter the exact question.");
      await repository.saveApplicationQuestion(applicationQuestionDraft);
      await reload();
      setModal("application");
      setNotice("Application answer saved.");
    });
  }

  async function saveNote(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!noteDraft.content.trim()) throw new Error("Enter note content.");
      await repository.saveNote(noteDraft);
      await reload();
      setModal("application");
      setNotice("Note saved.");
    });
  }

  async function deleteItem(entity: Parameters<typeof repository.deleteEntity>[0], id: string, label: string, nextModal: ModalName = null) {
    if (entity === "resume") {
      const linkedRoles = data.applications.filter((item) => item.resumeId === id);
      if (linkedRoles.length) {
        setError(`This resume is linked to ${linkedRoles.length} role${linkedRoles.length === 1 ? "" : "s"}. Change or delete those roles first.`);
        return;
      }
    }
    if (entity === "coverLetter" && data.applications.some((item) => item.coverLetterId === id)) {
      setError("This cover letter is linked to one or more roles. Change those roles before deleting it.");
      return;
    }

    const companyApplications = entity === "company" ? data.applications.filter((item) => item.companyId === id) : [];
    const application = entity === "application" ? data.applications.find((item) => item.id === id) : undefined;
    const orphanCandidates = entity === "company" ? companyApplications.map((item) => item.resumeId) : application?.resumeId ? [application.resumeId] : [];
    const companyRoleCount = companyApplications.length;
    const confirmation = companyRoleCount
      ? `Delete ${label} and its ${companyRoleCount} linked role${companyRoleCount === 1 ? "" : "s"}?`
      : `Delete ${label}? This cannot be undone.`;
    if (!window.confirm(confirmation)) return;

    await run(async () => {
      const deletingCurrentResume = entity === "resume" && data.settings.currentResumeId === id;
      const deletingCurrentTemplate = entity === "coverLetterTemplate" && data.settings.coverLetterTemplateId === id;
      await repository.deleteEntity(entity, id);

      if (orphanCandidates.length) await cleanupOrphanResumes(orphanCandidates);

      if (deletingCurrentResume || deletingCurrentTemplate) {
        const settings = {
          ...data.settings,
          currentResumeId: deletingCurrentResume ? "" : data.settings.currentResumeId,
          coverLetterTemplateId: deletingCurrentTemplate ? "" : data.settings.coverLetterTemplateId,
        };
        await repository.saveSettings(settings);
        const remoteError = deletingCurrentResume
          ? await deleteRemoteSnapshot(CURRENT_RESUME_S3_KEY, settings)
          : await deleteRemoteSnapshot(COVER_LETTER_FORMAT_S3_KEY, settings);
        if (remoteError) setError(`Deleted locally. Cloud cleanup failed: ${remoteError}`);
      }

      await reload();
      setModal(nextModal);
      setNotice(`${label} deleted.`);
    });
  }

  async function importResume(markCurrent: boolean, forApplication = false) {
    await run(async () => {
      const paths = await chooseResumeSourceFiles();
      if (!paths.length) return;
      const imported = await importResumeSource(paths);
      let resume = data.resumes.find((item) => item.contentHash === imported.contentHash);
      if (!resume) {
        resume = { ...newResume(), name: imported.displayName, sourceType: imported.sourceType, editableText: imported.text, contentHash: imported.contentHash, latexText: imported.sourceType === "latex" ? imported.text : "", sourceFiles: imported.sourceFiles };
        await repository.saveResume(resume);
      }
      if (markCurrent) {
        const settings = { ...data.settings, currentResumeId: resume.id };
        await repository.saveSettings(settings);
        const cloudError = await saveRemoteSnapshot(CURRENT_RESUME_S3_KEY, resume, settings);
        if (cloudError) setError(`Current Resume saved locally. Cloud snapshot failed: ${cloudError}`);
      }
      if (forApplication) setApplicationDraft((current) => ({ ...current, resumeId: resume!.id }));
      await reload();
      setNotice(resume === data.resumes.find((item) => item.contentHash === imported.contentHash) ? "Existing resume selected." : "Resume imported.");
    });
  }

  async function importTemplate() {
    await run(async () => {
      const paths = await chooseResumeSourceFiles();
      if (!paths.length) return;
      const imported = await importResumeSource(paths);
      let template = data.coverLetterTemplates.find((item) => item.contentHash === imported.contentHash);
      if (!template) {
        template = { ...newCoverLetterTemplate(), name: imported.displayName, sourceType: imported.sourceType, editableText: imported.text, contentHash: imported.contentHash, latexText: imported.sourceType === "latex" ? imported.text : "", sourceFiles: imported.sourceFiles };
        await repository.saveCoverLetterTemplate(template);
      }
      const settings = { ...data.settings, coverLetterTemplateId: template.id };
      await repository.saveSettings(settings);
      const cloudError = await saveRemoteSnapshot(COVER_LETTER_FORMAT_S3_KEY, template, settings);
      if (cloudError) setError(`Cover letter format saved locally. Cloud snapshot failed: ${cloudError}`);
      await reload();
      setNotice("Cover letter format selected.");
    });
  }

  async function importApplicationCoverLetter() {
    await run(async () => {
      if (!applicationDraft.companyId) throw new Error("Select a company before uploading a company-specific cover letter.");
      const path = await chooseDocument();
      if (!path) return;
      const imported = await importTextDocument(path);
      const existing = data.coverLetters.find((item) => item.companyId === applicationDraft.companyId && item.contentHash === imported.contentHash);
      let letter = existing;
      if (!letter) {
        letter = { ...newCoverLetter(applicationDraft.companyId), name: imported.displayName, roleFamily: applicationDraft.roleTitle, sourceType: imported.sourceType, editableText: imported.text, contentHash: imported.contentHash, latexText: imported.sourceType === "latex" ? imported.text : "", sourceFiles: imported.sourceFiles };
        await repository.saveCoverLetter(letter);
      }
      setApplicationDraft((current) => ({ ...current, coverLetterId: letter!.id }));
      await reload();
      setNotice(existing ? "Existing cover letter selected." : "Cover letter imported.");
    });
  }

  function ensureAiReady() {
    if (!data.settings.aiEnabled) throw new Error("Enable AI assistance in Settings first.");
    if (!data.settings.aiProvider) throw new Error("Choose an AI provider in Settings.");
    if (!data.settings.aiModel.trim()) throw new Error("Enter a model name in Settings.");
  }

  async function fillCompanyWithAi() {
    await run(async () => {
      ensureAiReady();
      const raw = await trackedAiComplete("company_details", companyProfilePrompt(companyDraft, {
        descriptionMaxWords: data.settings.companyDescriptionMaxWords,
        productsMaxWords: data.settings.companyProductsMaxWords,
        industryMaxWords: data.settings.companyIndustryMaxWords,
        headquartersMaxWords: data.settings.companyHeadquartersMaxWords,
        systemPrompt: data.settings.companyDetailsSystemPrompt,
      }));
      const result = parseJsonObject<{ verified: boolean; shortDescription: string; industry: string; productsServices: string; headquarters: string }>(raw);
      if (!result.verified) {
        setNotice("The company could not be identified reliably. Complete the details manually.");
        return;
      }
      setCompanyDraft((current) => ({
        ...current,
        shortDescription: result.shortDescription ? limitWords(result.shortDescription, data.settings.companyDescriptionMaxWords) : current.shortDescription,
        industry: result.industry ? limitWords(result.industry, data.settings.companyIndustryMaxWords) : current.industry,
        productsServices: result.productsServices ? limitWords(result.productsServices, data.settings.companyProductsMaxWords) : current.productsServices,
        headquarters: result.headquarters ? limitWords(result.headquarters, data.settings.companyHeadquartersMaxWords) : current.headquarters,
      }));
      setNotice("Company fields filled. Review before saving.");
    });
  }

  async function refineCareerEntrySummary() {
    await run(async () => {
      ensureAiReady();
      const raw = await trackedAiComplete("career_entry_summary", careerEntrySummaryPrompt(careerDraft, data.settings.careerEntrySummarySystemPrompt));
      const result = parseJsonObject<{ summary: string }>(raw);
      setCareerDraft((current) => ({ ...current, entrySummary: limitWords(result.summary, CAREER_ENTRY_SUMMARY_MAX_WORDS) }));
      setNotice(careerDraft.entrySummary.trim() ? "Career entry summary refined. Review before saving." : "Career entry summary generated. Review before saving.");
    });
  }

  async function refineCareerEntryDescription() {
    await run(async () => {
      ensureAiReady();
      const raw = await trackedAiComplete("career_entry_description", careerEntryDescriptionPrompt(careerDraft, data.settings.careerEntryDescriptionSystemPrompt));
      const result = parseJsonObject<{ description: string }>(raw);
      setCareerDraft((current) => ({ ...current, detailedDescription: limitWords(result.description, 450) }));
      setNotice(careerDraft.detailedDescription.trim() ? "Career entry description refined. Review before saving." : "Career entry description generated. Review before saving.");
    });
  }

  async function generateCareerProfile() {
    await run(async () => {
      ensureAiReady();
      if (!data.careerEntries.length) throw new Error("Add Career Library entries first.");
      const raw = await trackedAiComplete("career_profile_summary", careerProfilePrompt(data.careerEntries, data.settings.careerProfileSystemPrompt));
      const result = parseJsonObject<{ summary: string }>(raw);
      const settings = { ...data.settings, careerProfileSummary: limitWords(result.summary, CAREER_PROFILE_MAX_WORDS) };
      await repository.saveSettings(settings);
      await reload();
      setNotice("Career profile summary generated. Review and edit it.");
    });
  }

  function selectedEvidence(application: JobApplication) {
    return scoreCareerEntries(application.jobDescription, data.careerEntries, 5)
      .map((match) => data.careerEntries.find((entry) => entry.id === match.entryId))
      .filter((entry): entry is CareerEntry => Boolean(entry));
  }

  async function reviewResumeForRole() {
    await run(async () => {
      ensureAiReady();
      const resume = data.resumes.find((item) => item.id === applicationDraft.resumeId) ?? currentResume(data);
      if (!resume) throw new Error("Select or upload a resume for this role, or upload a Current Resume first.");
      if (!applicationDraft.jobDescription.trim()) throw new Error("Add the job description first.");
      const evidence = selectedEvidence(applicationDraft);
      const company = data.companies.find((item) => item.id === applicationDraft.companyId);
      const currentWords = countWords(resume.editableText);
      const growthPercent = Math.max(0, data.settings.resumeMaxGrowthPercent);
      const maxResumeWords = Math.max(currentWords, Math.ceil(currentWords * (1 + growthPercent / 100)));
      const raw = await trackedAiComplete("resume_review", resumeReviewPrompt({
        company,
        application: applicationDraft,
        resume,
        careerProfileSummary: data.settings.careerProfileSummary,
        evidence,
        userPrompt: applicationDraft.aiUserPrompt,
        maxResumeWords,
        growthPercent,
        systemPrompt: data.settings.resumeReviewSystemPrompt,
      }));
      const result = normalizeResumeReview(parseJsonObject<ResumeReviewResult>(raw), maxResumeWords, growthPercent);
      const next = {
        ...applicationDraft,
        resumeId: applicationDraft.resumeId || resume.id,
        aiAssessment: result.assessment,
        resumeChangeNotes: result.needsChanges
          ? [...result.suggestedChanges, ...(result.unsupportedRequirements.length ? [`Unsupported requirements: ${result.unsupportedRequirements.join(", ")}`] : [])].join("\n")
          : "",
        suggestedResumeText: result.needsChanges ? result.updatedResumeText : "",
        selectedEvidenceJson: JSON.stringify(result.evidenceUsed),
      };
      setApplicationDraft(next);
      await repository.saveApplication(next);
      await reload();
      setNotice(result.needsChanges ? "Resume review completed. Material changes were suggested." : "Resume review completed. The current resume is a reasonable fit; no new variation is needed.");
    });
  }

  async function createCoverLetterForApplication() {
    await run(async () => {
      ensureAiReady();
      if (!applicationDraft.companyId) throw new Error("Select a company first.");
      if (!applicationDraft.jobDescription.trim()) throw new Error("Add the job description first.");
      const company = data.companies.find((item) => item.id === applicationDraft.companyId);
      const resume = data.resumes.find((item) => item.id === applicationDraft.resumeId) ?? currentResume(data);
      const evidence = selectedEvidence(applicationDraft);
      const raw = await trackedAiComplete("cover_letter", coverLetterPrompt({
        company,
        application: applicationDraft,
        resume,
        careerProfileSummary: data.settings.careerProfileSummary,
        evidence,
        coverLetterSample: currentTemplate(data)?.editableText ?? "",
        userPrompt: applicationDraft.aiUserPrompt,
        maxWords: data.settings.coverLetterMaxWords,
        systemPrompt: data.settings.coverLetterSystemPrompt,
      }));
      const result = parseJsonObject<{ coverLetterText: string }>(raw);
      if (!result.coverLetterText.trim()) throw new Error("The provider returned an empty cover letter.");
      const coverLetterText = result.coverLetterText.trim();
      const coverLetterWords = countWords(coverLetterText);
      if (coverLetterWords > data.settings.coverLetterMaxWords) throw new Error(`AI returned a ${coverLetterWords}-word cover letter. The configured maximum is ${data.settings.coverLetterMaxWords} words. Nothing was saved.`);
      const hash = await hashTextContent(coverLetterText);
      const existing = data.coverLetters.find((item) => item.companyId === applicationDraft.companyId && item.contentHash === hash);
      let id = existing?.id;
      if (!id) {
        const letter = { ...newCoverLetter(applicationDraft.companyId), name: `${company?.name || "Company"} — ${applicationDraft.roleTitle || "Role"}`, roleFamily: applicationDraft.roleTitle, editableText: coverLetterText, contentHash: hash };
        await repository.saveCoverLetter(letter);
        id = letter.id;
      }
      const next = { ...applicationDraft, resumeId: applicationDraft.resumeId || resume?.id || "", coverLetterId: id! };
      setApplicationDraft(next);
      await repository.saveApplication(next);
      await reload();
      setNotice("Cover letter created. Review it before use.");
    });
  }

  async function saveSuggestedResume() {
    await run(async () => {
      if (!applicationDraft.suggestedResumeText.trim()) throw new Error("Run resume review first.");
      const hash = await hashTextContent(applicationDraft.suggestedResumeText);
      const existing = data.resumes.find((item) => item.contentHash === hash);
      let id = existing?.id;
      if (!id) {
        const original = data.resumes.find((item) => item.id === applicationDraft.resumeId);
        const resume = { ...newResume(), name: `${companyName(data, applicationDraft.companyId)} — ${applicationDraft.roleTitle || "Role"}`, sourceType: original?.sourceType ?? "text", editableText: applicationDraft.suggestedResumeText, contentHash: hash, latexText: original?.sourceType === "latex" ? applicationDraft.suggestedResumeText : "", sourceFiles: updatedResumeSourceFiles(original, applicationDraft.suggestedResumeText) };
        await repository.saveResume(resume);
        id = resume.id;
      }
      const next = { ...applicationDraft, resumeId: id! };
      setApplicationDraft(next);
      await repository.saveApplication(next);
      await reload();
      setNotice(existing ? "Existing resume variation selected." : "Resume variation saved and linked to this role.");
    });
  }

  async function exportLetterPdf() {
    await run(async () => {
      if (!letterDraft.editableText.trim()) throw new Error("Cover letter text is required before PDF export.");
      const path = await chooseCoverLetterPdfSavePath(letterDraft.name || "cover-letter");
      if (!path) return;
      await exportCoverLetterPdf(path, letterDraft.editableText);
      setLetterDraft((current) => ({ ...current, pdfPath: path }));
      setNotice("Cover letter PDF exported.");
    });
  }

  const filteredApplications = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.applications.filter((application) => !query || `${application.roleTitle} ${companyName(data, application.companyId)} ${application.jobId} ${application.status}`.toLowerCase().includes(query));
  }, [data, search]);

  const current = currentResume(data);
  const template = currentTemplate(data);
  const aiReady = aiSettingsReady(data.settings);

  if (loading) return <div className="loading-screen">Opening CareerTracker…</div>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Icon name="applications" width="22" /></div><div><strong>CareerTracker</strong><span>Application workspace</span></div></div>
        <nav>{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon name={item.icon} width="19" />{item.label}</button>)}</nav>
        <div className="sidebar-docs">
          <div className="sidebar-doc-item">
            <div><button className="sidebar-doc-button" onClick={() => current ? openResume(current) : importResume(true)}>Current Resume</button><button className="sidebar-doc-upload" aria-label="Upload current resume" onClick={() => importResume(true)}><Icon name="upload" width="13" /></button></div>
            <span title={current?.name || "Not set"}>{current?.name || "Not set"}</span>
          </div>
          <div className="sidebar-doc-item">
            <div><button className="sidebar-doc-button" onClick={() => template ? openTemplate(template) : importTemplate()}>Cover Letter Format</button><button className="sidebar-doc-upload" aria-label="Upload cover letter format" onClick={importTemplate}><Icon name="upload" width="13" /></button></div>
            <span title={template?.name || "Not set"}>{template?.name || "Not set"}</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><h1>{navItems.find((item) => item.id === view)?.label}</h1></div>
          <div className="topbar-actions global-actions">
            <button className="secondary-button global-action-button" onClick={() => openCompany()}><Icon name="plus" width="14" />Add company</button>
            <button className="primary-button global-action-button" onClick={() => openApplication()}><Icon name="plus" width="14" />Add role</button>
          </div>
        </header>

        {error && <div className="alert error"><Icon name="warning" width="18" /><span>{error}</span><button onClick={() => setError("")}><Icon name="close" width="15" /></button></div>}
        {notice && <div className="alert success"><Icon name="check" width="18" /><span>{notice}</span></div>}

        {view === "overview" && <OverviewView data={data} onOpenRole={(item) => openApplication(item)} />}
        {view === "applications" && <ApplicationsView data={data} applications={filteredApplications} search={search} setSearch={setSearch} onOpen={(item) => openApplication(item)} onDelete={(item) => deleteItem("application", item.id, "role")} />}
        {view === "companies" && <CompaniesView data={data} onOpen={openCompany} onDelete={(item) => deleteItem("company", item.id, "company and its roles")} />}
        {view === "documents" && <DocumentsView data={data} onUploadCurrent={() => importResume(true)} onAddResume={() => openResume()} onEditResume={openResume} onDeleteResume={(item) => deleteItem("resume", item.id, "resume")} onUploadTemplate={importTemplate} onAddTemplate={() => openTemplate()} onEditTemplate={openTemplate} onDeleteTemplate={(item) => deleteItem("coverLetterTemplate", item.id, "cover letter format")} onSetTemplate={async (id) => { const selected = data.coverLetterTemplates.find((item) => item.id === id); const settings = { ...data.settings, coverLetterTemplateId: id }; await repository.saveSettings(settings); if (selected) { const cloudError = await saveRemoteSnapshot(COVER_LETTER_FORMAT_S3_KEY, selected, settings); if (cloudError) setError(`Cover letter format selected locally. Cloud snapshot failed: ${cloudError}`); } await reload(); }} onAddLetter={() => openLetter()} onEditLetter={openLetter} onDeleteLetter={(item) => deleteItem("coverLetter", item.id, "cover letter")} />}
        {view === "questions" && <QuestionsView data={data} onAdd={() => { setQuestionDraft(newQuestion()); setModal("question"); }} onEdit={(item) => { setQuestionDraft({ ...item }); setModal("question"); }} onDelete={(item) => deleteItem("question", item.id, "question")} />}
        {view === "library" && <CareerLibraryView data={data} busy={busy} onSaveProfile={async (summary) => { await repository.saveSettings({ ...data.settings, careerProfileSummary: summary }); await reload(); setNotice("Career profile saved."); }} onGenerateProfile={generateCareerProfile} onAdd={() => { setCareerDraft(newCareerEntry()); setModal("career"); }} onEdit={(item) => { setCareerDraft({ ...item }); setModal("career"); }} onDelete={(item) => deleteItem("careerEntry", item.id, "career entry")} />}
        {view === "settings" && <SettingsView data={data} onReload={reload} setNotice={setNotice} setError={setError} onDirtyChange={setSettingsDirty} />}
      </main>

      {modal === "company" && <Modal title={companyDraft.name ? "Edit company" : "Add company"} onClose={() => setModal(null)} wide>
        <form className="form-grid" onSubmit={saveCompany}>
          <Field label="Company name" required><input value={companyDraft.name} onChange={(event) => setCompanyDraft({ ...companyDraft, name: event.target.value })} /></Field>
          <Field label="Website"><input value={companyDraft.website} onChange={(event) => setCompanyDraft({ ...companyDraft, website: event.target.value })} /></Field>
          <Field label="Short description" full><textarea rows={3} value={companyDraft.shortDescription} onChange={(event) => setCompanyDraft({ ...companyDraft, shortDescription: event.target.value })} /></Field>
          <Field label="Industry"><input value={companyDraft.industry} onChange={(event) => setCompanyDraft({ ...companyDraft, industry: event.target.value })} /></Field>
          <Field label="Headquarters"><input value={companyDraft.headquarters} onChange={(event) => setCompanyDraft({ ...companyDraft, headquarters: event.target.value })} /></Field>
          <Field label="Products or services" full><textarea rows={3} value={companyDraft.productsServices} onChange={(event) => setCompanyDraft({ ...companyDraft, productsServices: event.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={4} value={companyDraft.notes} onChange={(event) => setCompanyDraft({ ...companyDraft, notes: event.target.value })} /></Field>
          <FormActions onCancel={() => setModal(null)} extra={<button type="button" className="secondary-button" disabled={busy || !companyDraft.name.trim() || !aiReady} title={aiReady ? "" : "Complete AI setup in Settings"} onClick={fillCompanyWithAi}><Icon name="spark" width="15" />Fill details with AI</button>} />
        </form>
      </Modal>}

      {modal === "application" && <Modal title={applicationDraft.roleTitle ? "Edit role" : "Add role"} onClose={() => setModal(null)} wide>
        <form className="form-grid" onSubmit={saveApplication}>
          <Field label="Company"><CompanyCombobox companies={data.companies} value={applicationDraft.companyId} onChange={(companyId) => setApplicationDraft({ ...applicationDraft, companyId, coverLetterId: "" })} /></Field>
          <Field label="Role title"><input value={applicationDraft.roleTitle} onChange={(event) => setApplicationDraft({ ...applicationDraft, roleTitle: event.target.value })} /></Field>
          <Field label="Job ID"><input value={applicationDraft.jobId} onChange={(event) => setApplicationDraft({ ...applicationDraft, jobId: event.target.value })} /></Field>
          <Field label="Job URL"><input value={applicationDraft.jobUrl} onChange={(event) => setApplicationDraft({ ...applicationDraft, jobUrl: event.target.value })} /></Field>
          <Field label="Location"><input value={applicationDraft.location} onChange={(event) => setApplicationDraft({ ...applicationDraft, location: event.target.value })} /></Field>
          <Field label="Work arrangement"><select className="compact-select" value={applicationDraft.workArrangement} onChange={(event) => setApplicationDraft({ ...applicationDraft, workArrangement: event.target.value })}><option value="">Not selected</option>{applicationDraft.workArrangement && !data.workArrangements.some((item) => item.name === applicationDraft.workArrangement) && <option value={applicationDraft.workArrangement}>{applicationDraft.workArrangement}</option>}{data.workArrangements.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></Field>
          <Field label="Date applied"><input type="date" value={applicationDraft.dateApplied} onChange={(event) => setApplicationDraft({ ...applicationDraft, dateApplied: event.target.value })} /></Field>
          <Field label="Status"><select value={applicationDraft.status} onChange={(event) => setApplicationDraft({ ...applicationDraft, status: event.target.value as ApplicationStatus })}>{Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></Field>
          <Field label="Job description" full><textarea rows={10} value={applicationDraft.jobDescription} onChange={(event) => setApplicationDraft({ ...applicationDraft, jobDescription: event.target.value })} /></Field>

          <section className="embedded-section full compact-role-section">
            <div className="section-heading"><div><h3>Resume</h3></div><div className="button-row"><button type="button" className="secondary-button compact-button" onClick={() => importResume(false, true)}><Icon name="upload" width="14" />Upload</button><button type="button" className="secondary-button compact-button" disabled={busy || !aiReady} title={aiReady ? "" : "Complete AI setup in Settings"} onClick={reviewResumeForRole}><Icon name="spark" width="14" />Check resume fit</button></div></div>
            <div className="compact-document-control"><select value={applicationDraft.resumeId} onChange={(event) => setApplicationDraft({ ...applicationDraft, resumeId: event.target.value })}><option value="">Use Current Resume</option>{data.resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select>{(applicationDraft.resumeId || current) && <button type="button" className="text-button" onClick={() => { const selected = data.resumes.find((item) => item.id === applicationDraft.resumeId) ?? current; if (selected) openResume(selected, true); }}>View</button>}</div>
          </section>

          <section className="embedded-section full compact-role-section">
            <div className="section-heading"><div><h3>Cover letter</h3></div><div className="button-row"><button type="button" className="secondary-button compact-button" onClick={importApplicationCoverLetter}><Icon name="upload" width="14" />Upload</button><button type="button" className="secondary-button compact-button" disabled={busy || !aiReady} title={aiReady ? "" : "Complete AI setup in Settings"} onClick={createCoverLetterForApplication}><Icon name="spark" width="14" />Create cover letter</button></div></div>
            <div className="compact-document-control"><select value={applicationDraft.coverLetterId} onChange={(event) => setApplicationDraft({ ...applicationDraft, coverLetterId: event.target.value })}><option value="">Not selected</option>{data.coverLetters.filter((letter) => letter.companyId === applicationDraft.companyId).map((letter) => <option key={letter.id} value={letter.id}>{letter.name}</option>)}</select>{applicationDraft.coverLetterId && <button type="button" className="text-button" onClick={() => { const selected = data.coverLetters.find((item) => item.id === applicationDraft.coverLetterId); if (selected) openLetter(selected, "", true); }}>View</button>}</div>
          </section>

          <section className="embedded-section full ai-workspace compact-role-section">
            <div className="section-heading"><div><h3>AI instruction and review</h3></div></div>
            <Field label="Additional instruction"><textarea rows={2} value={applicationDraft.aiUserPrompt} onChange={(event) => setApplicationDraft({ ...applicationDraft, aiUserPrompt: event.target.value })} placeholder="Optional instruction used for both resume review and cover letter generation." /></Field>
            {applicationDraft.jobDescription && data.careerEntries.length > 0 && <EvidencePreview data={data} application={applicationDraft} />}
            {applicationDraft.aiAssessment && <div className="review-result"><strong>Assessment</strong><p>{applicationDraft.aiAssessment}</p></div>}
            {applicationDraft.resumeChangeNotes && <Field label="Recommended changes"><textarea rows={4} value={applicationDraft.resumeChangeNotes} onChange={(event) => setApplicationDraft({ ...applicationDraft, resumeChangeNotes: event.target.value })} /></Field>}
            {applicationDraft.suggestedResumeText && <><Field label="Suggested resume text"><textarea rows={14} value={applicationDraft.suggestedResumeText} onChange={(event) => setApplicationDraft({ ...applicationDraft, suggestedResumeText: event.target.value })} /></Field><button type="button" className="secondary-button" onClick={saveSuggestedResume}>Save as resume variation</button></>}
          </section>

          <Field label="General notes" full><textarea rows={5} value={applicationDraft.generalNotes} onChange={(event) => setApplicationDraft({ ...applicationDraft, generalNotes: event.target.value })} /></Field>

          {data.applications.some((item) => item.id === applicationDraft.id) && <section className="embedded-section full">
            <div className="section-heading"><div><h3>Application questions</h3></div><button type="button" className="secondary-button" onClick={() => { setApplicationQuestionDraft(newApplicationQuestion(applicationDraft.id)); setModal("applicationQuestion"); }}><Icon name="plus" width="15" />Add question</button></div>
            {data.applicationQuestions.filter((item) => item.applicationId === applicationDraft.id).map((item) => <div className="mini-record" key={item.id}><div><strong>{item.questionText}</strong><span>{item.submittedAnswer || "No answer recorded"}</span></div><div><button type="button" className="icon-button" onClick={() => { setApplicationQuestionDraft({ ...item }); setModal("applicationQuestion"); }}><Icon name="edit" width="15" /></button><button type="button" className="icon-button danger" onClick={() => deleteItem("applicationQuestion", item.id, "application question", "application")}><Icon name="trash" width="15" /></button></div></div>)}
          </section>}

          {data.applications.some((item) => item.id === applicationDraft.id) && <section className="embedded-section full">
            <div className="section-heading"><div><h3>Notes</h3></div><button type="button" className="secondary-button" onClick={() => { setNoteDraft(newApplicationNote(applicationDraft.id)); setModal("note"); }}><Icon name="plus" width="15" />Add note</button></div>
            {data.notes.filter((item) => item.applicationId === applicationDraft.id).map((item) => <div className="mini-record" key={item.id}><div><strong>{item.title || item.noteType.replace("_", " ")}</strong><span>{item.content}</span></div><div><button type="button" className="icon-button" onClick={() => { setNoteDraft({ ...item }); setModal("note"); }}><Icon name="edit" width="15" /></button><button type="button" className="icon-button danger" onClick={() => deleteItem("note", item.id, "note", "application")}><Icon name="trash" width="15" /></button></div></div>)}
          </section>}

          <FormActions onCancel={() => setModal(null)} extra={data.applications.some((item) => item.id === applicationDraft.id) && <button type="button" className="danger-button" onClick={() => deleteItem("application", applicationDraft.id, "role")}><Icon name="trash" width="15" />Delete role</button>} />
        </form>
      </Modal>}

      {modal === "resume" && <Modal title={resumeDraft.name ? "Edit resume" : "Add resume"} onClose={() => { setModal(returnToApplication ? "application" : null); setReturnToApplication(false); }} wide>
        <form className="form-grid" onSubmit={saveResume}>
          <Field label="Name" required><input value={resumeDraft.name} onChange={(event) => setResumeDraft({ ...resumeDraft, name: event.target.value })} /></Field>
          <Field label="Source format"><select value={resumeDraft.sourceType} onChange={(event) => setResumeDraft({ ...resumeDraft, sourceType: event.target.value as Resume["sourceType"] })}><option value="text">Text</option><option value="latex">LaTeX</option><option value="pdf">Extracted PDF text</option></select></Field>
          <Field label="Resume text" full required><textarea className="code-textarea" rows={20} value={resumeDraft.editableText} onChange={(event) => setResumeDraft({ ...resumeDraft, editableText: event.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={3} value={resumeDraft.notes} onChange={(event) => setResumeDraft({ ...resumeDraft, notes: event.target.value })} /></Field>
          <FormActions onCancel={() => setModal(null)} extra={data.resumes.some((item) => item.id === resumeDraft.id) && <button type="button" className="danger-button" onClick={() => deleteItem("resume", resumeDraft.id, "resume")}><Icon name="trash" width="15" />Delete</button>} />
        </form>
      </Modal>}

      {modal === "template" && <Modal title={templateDraft.name ? "Edit cover letter format" : "Add cover letter format"} onClose={() => setModal(null)} wide>
        <form className="form-grid" onSubmit={saveTemplate}>
          <Field label="Name" required><input value={templateDraft.name} onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })} /></Field>
          <Field label="Source format"><select value={templateDraft.sourceType} onChange={(event) => setTemplateDraft({ ...templateDraft, sourceType: event.target.value as CoverLetterTemplate["sourceType"] })}><option value="text">Text</option><option value="latex">LaTeX</option><option value="pdf">Extracted PDF text</option></select></Field>
          <Field label="Sample text" full required><textarea className="code-textarea" rows={18} value={templateDraft.editableText} onChange={(event) => setTemplateDraft({ ...templateDraft, editableText: event.target.value })} /></Field>
          <Field label="LaTeX format reference" full><textarea className="code-textarea" rows={12} value={templateDraft.latexText} onChange={(event) => setTemplateDraft({ ...templateDraft, latexText: event.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={3} value={templateDraft.notes} onChange={(event) => setTemplateDraft({ ...templateDraft, notes: event.target.value })} /></Field>
          <FormActions onCancel={() => setModal(null)} extra={data.coverLetterTemplates.some((item) => item.id === templateDraft.id) && <button type="button" className="danger-button" onClick={() => deleteItem("coverLetterTemplate", templateDraft.id, "cover letter format")}><Icon name="trash" width="15" />Delete</button>} />
        </form>
      </Modal>}

      {modal === "letter" && <Modal title={letterDraft.name ? "Edit cover letter" : "Add cover letter"} onClose={() => { setModal(returnToApplication ? "application" : null); setReturnToApplication(false); }} wide>
        <form className="form-grid" onSubmit={saveLetter}>
          <Field label="Company"><CompanyCombobox companies={data.companies} value={letterDraft.companyId} onChange={(companyId) => setLetterDraft({ ...letterDraft, companyId })} /></Field>
          <Field label="Name" required><input value={letterDraft.name} onChange={(event) => setLetterDraft({ ...letterDraft, name: event.target.value })} /></Field>
          <Field label="Role or role family"><input value={letterDraft.roleFamily} onChange={(event) => setLetterDraft({ ...letterDraft, roleFamily: event.target.value })} /></Field>
          <Field label="Source format"><select value={letterDraft.sourceType} onChange={(event) => setLetterDraft({ ...letterDraft, sourceType: event.target.value as CoverLetter["sourceType"] })}><option value="text">Text</option><option value="latex">LaTeX</option><option value="pdf">Extracted PDF text</option></select></Field>
          <Field label="Cover letter text" full required><textarea rows={18} value={letterDraft.editableText} onChange={(event) => setLetterDraft({ ...letterDraft, editableText: event.target.value })} /></Field>
          <section className="embedded-section full compact-export"><div className="section-heading"><div><h3>PDF export</h3></div><div className="button-row"><button type="button" className="secondary-button" disabled={!letterDraft.editableText.trim()} onClick={exportLetterPdf}><Icon name="file" width="15" />Export PDF</button>{letterDraft.pdfPath && data.settings.storageMode !== "s3" && <button type="button" className="text-button" onClick={() => openLocalPath(letterDraft.pdfPath)}>Open PDF</button>}</div></div></section>
          <Field label="Notes" full><textarea rows={3} value={letterDraft.notes} onChange={(event) => setLetterDraft({ ...letterDraft, notes: event.target.value })} /></Field>
          <FormActions onCancel={() => setModal(null)} extra={data.coverLetters.some((item) => item.id === letterDraft.id) && <button type="button" className="danger-button" onClick={() => deleteItem("coverLetter", letterDraft.id, "cover letter")}><Icon name="trash" width="15" />Delete</button>} />
        </form>
      </Modal>}

      {modal === "question" && <Modal title={questionDraft.questionText ? "Edit question" : "Add question"} onClose={() => setModal(null)}>
        <form className="form-grid" onSubmit={saveQuestion}>
          <Field label="Scope" full><select value={questionDraft.scope === "generic" ? "common" : questionDraft.companyId} onChange={(event) => { const value = event.target.value; setQuestionDraft({ ...questionDraft, scope: value === "common" ? "generic" : "company", companyId: value === "common" ? "" : value }); }}><option value="common">Common Qs</option>{[...data.companies].sort((a,b) => a.name.localeCompare(b.name)).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
          <Field label="Question" full required><textarea rows={4} value={questionDraft.questionText} onChange={(event) => setQuestionDraft({ ...questionDraft, questionText: event.target.value })} /></Field>
          <Field label="Reusable answer" full><textarea rows={8} value={questionDraft.reusableAnswer} onChange={(event) => setQuestionDraft({ ...questionDraft, reusableAnswer: event.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={3} value={questionDraft.notes} onChange={(event) => setQuestionDraft({ ...questionDraft, notes: event.target.value })} /></Field>
          <FormActions onCancel={() => setModal(null)} />
        </form>
      </Modal>}

      {modal === "career" && <Modal title={careerDraft.title ? "Edit career entry" : "Add career entry"} onClose={() => setModal(null)} wide>
        <form className="form-grid career-entry-form" onSubmit={saveCareer}>
          <Field label="Category"><select value={careerDraft.category} onChange={(event) => setCareerDraft({ ...careerDraft, category: event.target.value as CareerEntryCategory })}><option value="career_work">Career work</option><option value="project">Project</option><option value="achievement">Achievement</option><option value="skill">Skill</option><option value="certification">Certification</option><option value="career_story">Career story</option></select></Field>
          <Field label="Title" required><input value={careerDraft.title} onChange={(event) => setCareerDraft({ ...careerDraft, title: event.target.value })} /></Field>
          <Field label="Organization"><input value={careerDraft.organization} onChange={(event) => setCareerDraft({ ...careerDraft, organization: event.target.value })} /></Field>
          <Field label="Skills"><input value={careerDraft.skills} onChange={(event) => setCareerDraft({ ...careerDraft, skills: event.target.value })} placeholder="Comma-separated" /></Field>
          <Field label="Technologies"><input value={careerDraft.technologies} onChange={(event) => setCareerDraft({ ...careerDraft, technologies: event.target.value })} /></Field>
          <Field label="Results or metrics"><input value={careerDraft.resultsMetrics} onChange={(event) => setCareerDraft({ ...careerDraft, resultsMetrics: event.target.value })} /></Field>
          <Field label="Summary" full><textarea rows={4} value={careerDraft.entrySummary} onChange={(event) => setCareerDraft({ ...careerDraft, entrySummary: event.target.value })} /></Field>
          <div className="full button-row refine-row">{data.settings.aiEnabled && <button type="button" className="secondary-button compact-button" disabled={busy} onClick={refineCareerEntrySummary}><Icon name="spark" width="15" />Refine summary</button>}</div>
          <details className="full career-description-editor">
            <summary><div><strong>Detailed description</strong><span>{careerDraft.detailedDescription.trim() ? `${countWords(careerDraft.detailedDescription)} words` : "Empty"}</span></div></summary>
            <div className="career-description-body">
              <textarea rows={10} value={careerDraft.detailedDescription} onChange={(event) => setCareerDraft({ ...careerDraft, detailedDescription: event.target.value })} placeholder="Detailed responsibilities, decisions, collaboration, technologies, and outcomes." />
              {data.settings.aiEnabled && <div className="button-row refine-row"><button type="button" className="secondary-button compact-button" disabled={busy} onClick={refineCareerEntryDescription}><Icon name="spark" width="15" />Refine description</button></div>}
            </div>
          </details>
          <Field label="Notes" full><textarea rows={3} value={careerDraft.notes} onChange={(event) => setCareerDraft({ ...careerDraft, notes: event.target.value })} /></Field>
          <FormActions onCancel={() => setModal(null)} extra={data.careerEntries.some((item) => item.id === careerDraft.id) && <button type="button" className="danger-button" onClick={() => deleteItem("careerEntry", careerDraft.id, "career entry")}><Icon name="trash" width="15" />Delete</button>} />
        </form>
      </Modal>}

      {modal === "applicationQuestion" && <Modal title="Application question" onClose={() => setModal("application")}>
        <form className="form-grid" onSubmit={saveApplicationQuestion}>
          <Field label="Use saved question" full><select value={applicationQuestionDraft.questionId} onChange={(event) => { const question = data.questions.find((item) => item.id === event.target.value); setApplicationQuestionDraft({ ...applicationQuestionDraft, questionId: event.target.value, questionText: question?.questionText ?? applicationQuestionDraft.questionText, submittedAnswer: question?.reusableAnswer ?? applicationQuestionDraft.submittedAnswer }); }}><option value="">Enter manually</option>{data.questions.filter((item) => item.scope === "generic" || item.companyId === applicationDraft.companyId).map((question) => <option key={question.id} value={question.id}>{question.questionText}</option>)}</select></Field>
          <Field label="Exact question" full required><textarea rows={4} value={applicationQuestionDraft.questionText} onChange={(event) => setApplicationQuestionDraft({ ...applicationQuestionDraft, questionText: event.target.value })} /></Field>
          <Field label="Submitted answer" full><textarea rows={10} value={applicationQuestionDraft.submittedAnswer} onChange={(event) => setApplicationQuestionDraft({ ...applicationQuestionDraft, submittedAnswer: event.target.value })} /></Field>
          <Field label="Word or character limit"><input value={applicationQuestionDraft.responseLimit} onChange={(event) => setApplicationQuestionDraft({ ...applicationQuestionDraft, responseLimit: event.target.value })} /></Field>
          <FormActions onCancel={() => setModal("application")} />
        </form>
      </Modal>}

      {modal === "note" && <Modal title="Application note" onClose={() => setModal("application")}>
        <form className="form-grid" onSubmit={saveNote}>
          <Field label="Type"><select value={noteDraft.noteType} onChange={(event) => setNoteDraft({ ...noteDraft, noteType: event.target.value as ApplicationNote["noteType"] })}><option value="general">General</option><option value="hr">HR / Recruiter</option><option value="hiring_manager">Hiring Manager</option><option value="referral">Referral</option></select></Field>
          <Field label="Title"><input value={noteDraft.title} onChange={(event) => setNoteDraft({ ...noteDraft, title: event.target.value })} /></Field>
          <Field label="Content" full required><textarea rows={12} value={noteDraft.content} onChange={(event) => setNoteDraft({ ...noteDraft, content: event.target.value })} /></Field>
          <FormActions onCancel={() => setModal("application")} />
        </form>
      </Modal>}

      {busy && <div className="busy-overlay"><div className="spinner" /><span>Working…</span></div>}
    </div>
  );
}

function OverviewView({ data, onOpenRole }: {
  data: AppData;
  onOpenRole: (item: JobApplication) => void;
}) {
  const active = data.applications.filter((item) => item.status !== "success" && item.status !== "learning_experience").slice(0, 12);
  return <div className="page-stack compact-page-stack">
    <section className="summary-grid">{overviewStatuses.map((status) => <div className="summary-card" key={status}><span>{statusMeta[status].label}</span><strong>{data.applications.filter((item) => item.status === status).length}</strong></div>)}</section>
    <section className="panel full-width dense-panel"><div className="panel-heading compact-heading"><div><h2>Active roles</h2></div></div>{active.length ? <div className="role-list">{active.map((item) => <RoleRow key={item.id} data={data} application={item} onClick={() => onOpenRole(item)} />)}</div> : <EmptyState title="No active roles" text="Use Add role in the header to start tracking an application." />}</section>
  </div>;
}

function ApplicationsView({ data, applications, search, setSearch, onOpen, onDelete }: { data: AppData; applications: JobApplication[]; search: string; setSearch: (value: string) => void; onOpen: (item: JobApplication) => void; onDelete: (item: JobApplication) => void }) {
  return <section className="panel full-width dense-panel"><div className="toolbar"><div className="search-box"><Icon name="search" width="16" /><input placeholder="Search company, role, job ID or status" value={search} onChange={(event) => setSearch(event.target.value)} /></div><span>{applications.length} roles</span></div>{applications.length ? <div className="data-table"><div className="table-head"><span>Role</span><span>Date</span><span>Resume</span><span>Status</span><span /></div>{applications.map((item) => <div className="table-row" key={item.id}><button className="row-main" onClick={() => onOpen(item)}><div><strong>{item.roleTitle || "Role title not recorded"}</strong><span>{companyName(data, item.companyId)}{item.jobId ? ` · ${item.jobId}` : ""}</span></div></button><span>{formatDate(item.dateApplied)}</span><span className="truncate-cell">{resumeName(data, item.resumeId)}</span><span className={`status-pill ${statusMeta[item.status].className}`}>{statusMeta[item.status].label}</span><button className="icon-button danger compact-icon" aria-label="Delete role" onClick={() => onDelete(item)}><Icon name="trash" width="14" /></button></div>)}</div> : <EmptyState title="No roles found" text={search ? "No roles match this search." : "Use Add role in the header to start tracking an application."} action={search ? "Clear search" : undefined} onAction={search ? () => setSearch("") : undefined} />}</section>;
}

function CompaniesView({ data, onOpen, onDelete }: { data: AppData; onOpen: (item: Company) => void; onDelete: (item: Company) => void }) {
  return <section className="panel full-width dense-panel"><div className="panel-heading compact-heading"><div><h2>Companies</h2></div></div>{data.companies.length ? <div className="company-list">{[...data.companies].sort((a,b) => a.name.localeCompare(b.name)).map((company) => <div className="company-row" key={company.id}><strong>{company.name}</strong><div><button className="icon-button compact-icon" aria-label={`Edit ${company.name}`} onClick={() => onOpen(company)}><Icon name="edit" width="14" /></button><button className="icon-button danger compact-icon" aria-label={`Delete ${company.name}`} onClick={() => onDelete(company)}><Icon name="trash" width="14" /></button></div></div>)}</div> : <EmptyState title="No companies" text="Use Add company in the header to create your first company." />}</section>;
}

function DocumentsView(props: {
  data: AppData;
  onUploadCurrent: () => void;
  onAddResume: () => void;
  onEditResume: (item: Resume) => void;
  onDeleteResume: (item: Resume) => void;
  onUploadTemplate: () => void;
  onAddTemplate: () => void;
  onEditTemplate: (item: CoverLetterTemplate) => void;
  onDeleteTemplate: (item: CoverLetterTemplate) => void;
  onSetTemplate: (id: string) => void;
  onAddLetter: () => void;
  onEditLetter: (item: CoverLetter) => void;
  onDeleteLetter: (item: CoverLetter) => void;
}) {
  const { data } = props;
  const [tab, setTab] = useState<"resumes" | "letters">("resumes");
  const [companyFilter, setCompanyFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const companyQuery = companyFilter.trim().toLowerCase();
  const inDateRange = (createdAt: string) => {
    const day = createdAt ? createdAt.slice(0, 10) : "";
    if (createdFrom && (!day || day < createdFrom)) return false;
    if (createdTo && (!day || day > createdTo)) return false;
    return true;
  };
  const companyMatchesResume = (resume: Resume) => {
    if (!companyQuery) return true;
    return data.applications.some((application) => (application.resumeId === resume.id || (!application.resumeId && data.settings.currentResumeId === resume.id)) && companyName(data, application.companyId).toLowerCase().includes(companyQuery));
  };
  const resumes = data.resumes.filter((item) => inDateRange(item.createdAt) && companyMatchesResume(item));
  const letters = data.coverLetters.filter((item) => inDateRange(item.createdAt) && (!companyQuery || companyName(data, item.companyId).toLowerCase().includes(companyQuery)));
  const templates = data.coverLetterTemplates.filter((item) => inDateRange(item.createdAt) && !companyQuery);
  const dateLabel = (createdAt: string) => createdAt ? new Date(createdAt).toLocaleDateString() : "Date unavailable";

  return <div className="documents-shell">
    <div className="document-tabs"><button className={tab === "resumes" ? "active" : ""} onClick={() => setTab("resumes")}>Resumes</button><button className={tab === "letters" ? "active" : ""} onClick={() => setTab("letters")}>Cover Letters</button></div>
    <section className="panel dense-panel document-filter-bar"><div className="search-box"><Icon name="search" width="14" /><input list="document-company-options" placeholder="Filter company" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} /><datalist id="document-company-options">{data.companies.map((company) => <option key={company.id} value={company.name} />)}</datalist></div><Field label="Created from"><input type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} /></Field><Field label="Created to"><input type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} /></Field>{(companyFilter || createdFrom || createdTo) && <button className="text-button" onClick={() => { setCompanyFilter(""); setCreatedFrom(""); setCreatedTo(""); }}>Clear</button>}</section>

    {tab === "resumes" ? <section className="panel dense-panel"><div className="panel-heading compact-heading"><div><h2>Resumes</h2><span className="muted">{resumes.length} shown</span></div><div className="button-row"><button className="secondary-button compact-button" onClick={props.onUploadCurrent}><Icon name="upload" width="13" />Upload Current</button><button className="primary-button compact-button" onClick={props.onAddResume}><Icon name="plus" width="13" />Add</button></div></div>{resumes.length ? <div className="document-list compact-document-list">{resumes.map((item) => <DocumentRow key={item.id} title={item.name} subtitle={`${item.sourceType.toUpperCase()} · ${dateLabel(item.createdAt)}`} current={data.settings.currentResumeId === item.id} onOpen={() => props.onEditResume(item)} onDelete={() => props.onDeleteResume(item)} />)}</div> : <EmptyState compact title="No resumes found" text="Adjust the filters or add a resume." action="Upload resume" onAction={props.onUploadCurrent} />}</section> : <div className="document-cover-stack">
      {!companyQuery && <section className="panel dense-panel"><div className="panel-heading compact-heading"><div><h2>Cover Letter Format</h2></div><div className="button-row"><button className="secondary-button compact-button" onClick={props.onUploadTemplate}><Icon name="upload" width="13" />Upload</button><button className="primary-button compact-button" onClick={props.onAddTemplate}><Icon name="plus" width="13" />Add</button></div></div>{templates.length ? <div className="document-list compact-document-list">{templates.map((item) => <DocumentRow key={item.id} title={item.name} subtitle={`${item.sourceType.toUpperCase()} · ${dateLabel(item.createdAt)}`} current={data.settings.coverLetterTemplateId === item.id} onOpen={() => props.onEditTemplate(item)} onSetCurrent={() => props.onSetTemplate(item.id)} onDelete={() => props.onDeleteTemplate(item)} />)}</div> : <div className="gentle-note">No cover-letter format matches the selected date range.</div>}</section>}
      <section className="panel dense-panel"><div className="panel-heading compact-heading"><div><h2>Cover Letters</h2><span className="muted">{letters.length} shown</span></div><button className="primary-button compact-button" onClick={props.onAddLetter}><Icon name="plus" width="13" />Add</button></div>{letters.length ? <div className="document-list compact-document-list">{letters.map((item) => <DocumentRow key={item.id} title={item.name} subtitle={`${companyName(data, item.companyId)}${item.roleFamily ? ` · ${item.roleFamily}` : ""} · ${dateLabel(item.createdAt)}`} onOpen={() => props.onEditLetter(item)} onDelete={() => props.onDeleteLetter(item)} />)}</div> : <EmptyState compact title="No cover letters found" text="Adjust the filters or add a cover letter." action="Add cover letter" onAction={props.onAddLetter} />}</section>
    </div>}
  </div>;
}

function QuestionsView({ data, onAdd, onEdit, onDelete }: { data: AppData; onAdd: () => void; onEdit: (item: Question) => void; onDelete: (item: Question) => void }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const companies = useMemo(() => [...data.companies].sort((a, b) => a.name.localeCompare(b.name)), [data.companies]);
  const normalized = query.trim().toLowerCase();
  const questions = data.questions.filter((item) => {
    const scopeMatch = scope === "all" || (scope === "common" ? item.scope === "generic" : item.scope === "company" && item.companyId === scope);
    if (!scopeMatch) return false;
    if (!normalized) return true;
    const label = item.scope === "generic" ? "Common Qs" : companyName(data, item.companyId);
    return `${item.questionText} ${item.reusableAnswer} ${item.notes} ${label}`.toLowerCase().includes(normalized);
  });

  return <section className="panel full-width dense-panel"><div className="panel-heading compact-heading"><div><h2>Question repository</h2></div><button className="primary-button compact-button" onClick={onAdd}><Icon name="plus" width="15" />Add question</button></div>
    <div className="question-filter-bar"><div className="search-box"><Icon name="search" width="15" /><input placeholder="Search questions or company" value={query} onChange={(event) => setQuery(event.target.value)} /></div><label className="compact-filter"><span>Scope</span><select value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">All scopes</option><option value="common">Common Qs</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><span className="list-count">{questions.length} questions</span></div>
    {questions.length ? <div className="question-list compact-question-list">{questions.map((item) => <div className="question-row" key={item.id}><span className="scope-tag">{item.scope === "generic" ? "Common Qs" : companyName(data, item.companyId)}</span><div className="question-row-main"><strong title={item.questionText}>{item.questionText}</strong><span title={item.reusableAnswer}>{item.reusableAnswer || "No reusable answer"}</span></div><div className="row-actions"><button className="icon-button compact-icon" onClick={() => onEdit(item)} aria-label="Edit question"><Icon name="edit" width="14" /></button><button className="icon-button danger compact-icon" onClick={() => onDelete(item)} aria-label="Delete question"><Icon name="trash" width="14" /></button></div></div>)}</div> : <EmptyState compact title="No questions found" text={data.questions.length ? "Adjust the search or scope filter." : "Add common questions or company-specific questions."} action={data.questions.length ? "Clear filters" : "Add question"} onAction={data.questions.length ? () => { setQuery(""); setScope("all"); } : onAdd} />}
  </section>;
}

function CareerLibraryView({ data, busy, onSaveProfile, onGenerateProfile, onAdd, onEdit, onDelete }: { data: AppData; busy: boolean; onSaveProfile: (summary: string) => void; onGenerateProfile: () => void; onAdd: () => void; onEdit: (item: CareerEntry) => void; onDelete: (item: CareerEntry) => void }) {
  const [summary, setSummary] = useState(data.settings.careerProfileSummary);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  useEffect(() => setSummary(data.settings.careerProfileSummary), [data.settings.careerProfileSummary]);
  const normalized = query.trim().toLowerCase();
  const entries = data.careerEntries.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (!normalized) return true;
    return `${item.title} ${item.organization} ${item.skills} ${item.technologies} ${item.resultsMetrics} ${item.entrySummary}`.toLowerCase().includes(normalized);
  });

  return <div className="page-stack compact-page-stack">
    <details className="panel profile-panel career-profile-details">
      <summary className="career-profile-summary-head"><div><h2>Career Profile Summary</h2><span>{summary.trim() ? `${countWords(summary)} words · click to view or edit` : "Not created · click to open"}</span></div></summary>
      <div className="career-profile-body"><div className="button-row profile-actions">{data.settings.aiEnabled && <button className="secondary-button compact-button" disabled={busy} onClick={onGenerateProfile}><Icon name="spark" width="15" />Generate / refine from library</button>}</div><textarea rows={7} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Summarize your career experience, strengths, industries, and role positioning." /><div className="align-right"><button className="primary-button compact-button" onClick={() => onSaveProfile(summary)}>Save summary</button></div></div>
    </details>
    <section className="panel dense-panel"><div className="panel-heading compact-heading"><div><h2>Career entries</h2></div><button className="primary-button compact-button" onClick={onAdd}><Icon name="plus" width="15" />Add entry</button></div>
      <div className="career-filter-bar"><div className="search-box"><Icon name="search" width="15" /><input placeholder="Search title, organization, skills or technology" value={query} onChange={(event) => setQuery(event.target.value)} /></div><label className="compact-filter"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option><option value="career_work">Career work</option><option value="project">Project</option><option value="achievement">Achievement</option><option value="skill">Skill</option><option value="certification">Certification</option><option value="career_story">Career story</option></select></label><span className="list-count">{entries.length} entries</span></div>
      {entries.length ? <div className="career-list">{entries.map((item) => <div className="career-row" key={item.id}><span className="scope-tag">{item.category.replace("_", " ")}</span><button className="career-row-main" onClick={() => onEdit(item)}><strong>{item.title}</strong><span>{item.organization || "No organization"}{item.technologies ? ` · ${item.technologies}` : item.skills ? ` · ${item.skills}` : ""}</span></button><span className="career-result-preview" title={item.resultsMetrics || item.entrySummary}>{item.resultsMetrics || item.entrySummary || "No result or summary yet"}</span><div className="row-actions"><button className="icon-button compact-icon" onClick={() => onEdit(item)} aria-label="Edit career entry"><Icon name="edit" width="14" /></button><button className="icon-button danger compact-icon" onClick={() => onDelete(item)} aria-label="Delete career entry"><Icon name="trash" width="14" /></button></div></div>)}</div> : <EmptyState compact title="No career entries found" text={data.careerEntries.length ? "Adjust the search or category filter." : "Add verified career evidence before using resume matching."} action={data.careerEntries.length ? "Clear filters" : "Add entry"} onAction={data.careerEntries.length ? () => { setQuery(""); setCategory("all"); } : onAdd} />}
    </section>
  </div>;
}

function SettingsView({ data, onReload, setNotice, setError, onDirtyChange }: { data: AppData; onReload: () => Promise<void>; setNotice: (value: string) => void; setError: (value: string) => void; onDirtyChange: (value: boolean) => void }) {
  const [draft, setDraft] = useState(data.settings);
  const [apiKey, setApiKey] = useState("");
  const [s3Access, setS3Access] = useState("");
  const [s3Secret, setS3Secret] = useState("");
  const [aiKeyStored, setAiKeyStored] = useState(false);
  const [s3KeysStored, setS3KeysStored] = useState(false);
  const [working, setWorking] = useState(false);
  const [backupDestination, setBackupDestination] = useState<"local" | "s3">("local");
  const [s3Backups, setS3Backups] = useState<string[]>([]);
  const [selectedS3Backup, setSelectedS3Backup] = useState("");
  const [newWorkArrangementName, setNewWorkArrangementName] = useState("");
  const [settingsTab, setSettingsTab] = useState<"general" | "ai">("general");

  useEffect(() => { setDraft(data.settings); onDirtyChange(false); }, [data.settings, onDirtyChange]);
  useEffect(() => { onDirtyChange(JSON.stringify(draft) !== JSON.stringify(data.settings)); }, [draft, data.settings, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    if (draft.aiProvider) hasSecret(`${draft.aiProvider}_api_key`).then(setAiKeyStored).catch(() => setAiKeyStored(false));
    hasS3CredentialPair().then(setS3KeysStored).catch(() => setS3KeysStored(false));
  }, [draft.aiProvider]);

  async function safe(action: () => Promise<void>) {
    setWorking(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      void logClientEvent("error", "settings.action", message);
      setError(message);
    } finally {
      setWorking(false);
    }
  }

  async function saveSettings() {
    await safe(async () => {
      const settingsToSave = {
        ...draft,
        companyDescriptionMaxWords: Math.max(10, Math.round(Number(draft.companyDescriptionMaxWords) || 0)),
        companyProductsMaxWords: Math.max(5, Math.round(Number(draft.companyProductsMaxWords) || 0)),
        companyIndustryMaxWords: Math.min(50, Math.max(1, Math.round(Number(draft.companyIndustryMaxWords) || 0))),
        companyHeadquartersMaxWords: Math.min(50, Math.max(1, Math.round(Number(draft.companyHeadquartersMaxWords) || 0))),
        resumeMaxGrowthPercent: Math.min(100, Math.max(0, Number(draft.resumeMaxGrowthPercent) || 0)),
        coverLetterMaxWords: Math.max(50, Math.round(Number(draft.coverLetterMaxWords) || 0)),
        companyDetailsSystemPrompt: draft.companyDetailsSystemPrompt.trim() || DEFAULT_COMPANY_DETAILS_PROMPT,
        careerEntrySummarySystemPrompt: draft.careerEntrySummarySystemPrompt.trim() || DEFAULT_CAREER_ENTRY_SUMMARY_PROMPT,
        careerEntryDescriptionSystemPrompt: draft.careerEntryDescriptionSystemPrompt.trim() || DEFAULT_CAREER_ENTRY_DESCRIPTION_PROMPT,
        careerProfileSystemPrompt: draft.careerProfileSystemPrompt.trim() || DEFAULT_CAREER_PROFILE_PROMPT,
        resumeReviewSystemPrompt: draft.resumeReviewSystemPrompt.trim() || DEFAULT_RESUME_REVIEW_PROMPT,
        coverLetterSystemPrompt: draft.coverLetterSystemPrompt.trim() || DEFAULT_COVER_LETTER_PROMPT,
      };
      const oldPath = data.settings.workspacePath.trim();
      const newPath = settingsToSave.workspacePath.trim();
      const localEnabled = settingsToSave.storageMode === "local" || settingsToSave.storageMode === "hybrid";
      if (localEnabled && oldPath && newPath && oldPath.toLowerCase() !== newPath.toLowerCase()) {
        const migrate = window.confirm("Move existing generated files into the new local folder?");
        if (migrate) {
          const copied = await migrateWorkspace(oldPath, newPath);
          await repository.rebaseDocumentPaths(oldPath, newPath);
          setNotice(`${copied} files copied.`);
        }
      }
      await repository.saveSettings(settingsToSave);

      if ((settingsToSave.storageMode === "s3" || settingsToSave.storageMode === "hybrid") && s3KeysStored) {
        const resume = currentResume(data);
        const template = currentTemplate(data);
        if (resume) await putS3TextObject(settingsToSave, CURRENT_RESUME_S3_KEY, JSON.stringify(resume));
        if (template) await putS3TextObject(settingsToSave, COVER_LETTER_FORMAT_S3_KEY, JSON.stringify(template));
      }

      setDraft(settingsToSave);
      onDirtyChange(false);
      await onReload();
      setNotice("Settings saved.");
    });
  }

  async function saveAiCredential() {
    await safe(async () => {
      if (!draft.aiProvider) throw new Error("Choose a provider first.");
      if (!apiKey.trim()) throw new Error("Enter an API key.");
      await saveSecret(`${draft.aiProvider}_api_key`, apiKey);
      setApiKey("");
      setAiKeyStored(true);
      setNotice("API key saved.");
    });
  }

  async function removeAiCredential() {
    await safe(async () => {
      if (!draft.aiProvider) return;
      await deleteSecret(`${draft.aiProvider}_api_key`);
      setAiKeyStored(false);
      setNotice("API key removed.");
    });
  }

  async function saveS3Credentials() {
    await safe(async () => {
      if (!s3Access.trim() || !s3Secret.trim()) throw new Error("Enter both S3 credentials.");
      await saveS3CredentialPair(s3Access, s3Secret);
      setS3Access("");
      setS3Secret("");
      setS3KeysStored(true);
      setNotice("S3 credentials saved.");
    });
  }

  async function createBackup() {
    await safe(async () => {
      const json = JSON.stringify(createApplicationBackup(data), null, 2);
      if (backupDestination === "local") {
        const path = await chooseBackupSavePath();
        if (!path) return;
        await writeLocalBackup(path, json);
        setNotice(`Backup created: ${path}`);
        return;
      }
      if (!s3KeysStored) throw new Error("Save S3 credentials first.");
      const key = await writeS3Backup(draft, json);
      setNotice(`Backup created: ${key}`);
      const keys = await listS3Backups(draft);
      setS3Backups(keys);
      setSelectedS3Backup(keys[0] ?? "");
    });
  }

  async function refreshS3Backups() {
    await safe(async () => {
      if (!s3KeysStored) throw new Error("Save S3 credentials first.");
      const keys = await listS3Backups(draft);
      setS3Backups(keys);
      if (!keys.includes(selectedS3Backup)) setSelectedS3Backup(keys[0] ?? "");
      if (!keys.length) setNotice("No S3 backups found.");
    });
  }

  async function loadBackup() {
    await safe(async () => {
      let raw = "";
      if (backupDestination === "local") {
        const path = await chooseBackupFile();
        if (!path) return;
        raw = await readBackup(path);
      } else {
        if (!selectedS3Backup) throw new Error("Select an S3 backup first.");
        raw = await readS3Backup(draft, selectedS3Backup);
      }

      const result = await mergeApplicationBackup(repository, data, parseApplicationBackup(raw));
      await onReload();
      setNotice(`Backup loaded: ${result.companiesAdded} companies added, ${result.applicationsAdded} roles added, ${result.applicationsSkipped} roles skipped.`);
    });
  }

  async function openDiagnosticsFolder() {
    await safe(async () => {
      const path = await diagnosticsLogDir();
      if (!path) throw new Error("Diagnostics folder is unavailable.");
      await openLocalPath(path);
    });
  }

  async function copyRecentDiagnostics() {
    await safe(async () => {
      const text = await readRecentDiagnostics();
      if (!text.trim()) {
        setNotice("No diagnostics recorded.");
        return;
      }
      await navigator.clipboard.writeText(text);
      setNotice("Recent diagnostics copied.");
    });
  }

  async function removeDiagnostics() {
    await safe(async () => {
      await clearDiagnostics();
      setNotice("Diagnostics cleared.");
    });
  }

  async function addWorkArrangement() {
    await safe(async () => {
      const name = newWorkArrangementName.trim();
      if (!name) throw new Error("Enter a work arrangement name.");
      if (data.workArrangements.some((item) => item.name.toLowerCase() === name.toLowerCase())) throw new Error("That work arrangement already exists.");
      const sortOrder = Math.max(0, ...data.workArrangements.map((item) => item.sortOrder)) + 10;
      await repository.saveWorkArrangement({ id: crypto.randomUUID(), name, sortOrder });
      setNewWorkArrangementName("");
      await onReload();
      setNotice("Work arrangement added.");
    });
  }

  async function deleteWorkArrangement(id: string) {
    await safe(async () => {
      await repository.deleteEntity("workArrangement", id);
      await onReload();
      setNotice("Work arrangement removed.");
    });
  }

  const s3Enabled = draft.storageMode === "s3" || draft.storageMode === "hybrid";
  const localEnabled = draft.storageMode === "local" || draft.storageMode === "hybrid";

  useEffect(() => {
    if (!s3Enabled && backupDestination === "s3") setBackupDestination("local");
  }, [s3Enabled, backupDestination]);

  return <div className="settings-shell">
    <div className="settings-tabs">
      <button className={settingsTab === "general" ? "active" : ""} onClick={() => setSettingsTab("general")}>Configuration</button>
      <button className={settingsTab === "ai" ? "active" : ""} onClick={() => setSettingsTab("ai")}>AI Prompts & Usage</button>
    </div>

    {settingsTab === "general" ? <div className="settings-grid">
      <section className="panel settings-compact-panel"><div className="panel-heading"><div><h2>Storage</h2></div></div><div className="settings-form">
        <Field label="Storage mode"><select value={draft.storageMode} onChange={(event) => setDraft({ ...draft, storageMode: event.target.value as AppData["settings"]["storageMode"] })}><option value="local">Local only</option><option value="s3">S3 only</option><option value="hybrid">Local + S3</option></select></Field>
        {localEnabled && <Field label="Local folder"><div className="path-picker"><input value={draft.workspacePath} onChange={(event) => setDraft({ ...draft, workspacePath: event.target.value })} placeholder="C:\Users\You\Documents\CareerTracker" /><button className="secondary-button compact-button" type="button" onClick={async () => { const path = await chooseFolder(); if (path) setDraft({ ...draft, workspacePath: path }); }}>Browse</button></div></Field>}
      </div></section>

      <section className="panel settings-compact-panel"><div className="panel-heading"><div><h2>Work arrangements</h2></div></div><div className="work-arrangement-list">{data.workArrangements.map((item) => <div key={item.id}><span>{item.name}</span><button type="button" className="icon-button danger compact-icon" aria-label={`Delete ${item.name}`} onClick={() => deleteWorkArrangement(item.id)}><Icon name="trash" width="13" /></button></div>)}</div><div className="compact-add-row"><input value={newWorkArrangementName} onChange={(event) => setNewWorkArrangementName(event.target.value)} placeholder="Add arrangement" /><button type="button" className="secondary-button compact-button" onClick={addWorkArrangement}>Add</button></div></section>

      <div className="settings-pair full-span">
        <section className="panel settings-connection-panel"><div className="panel-heading"><div><h2>AI</h2></div><span className={`connection-state ${aiKeyStored ? "ready" : ""}`}>{aiKeyStored ? "Key stored" : "No key"}</span></div><div className="settings-form two-column"><label className="toggle-row full"><div><strong>Enable AI actions</strong></div><input type="checkbox" checked={draft.aiEnabled} onChange={(event) => setDraft({ ...draft, aiEnabled: event.target.checked })} /></label><Field label="Provider"><select value={draft.aiProvider} onChange={(event) => setDraft({ ...draft, aiProvider: event.target.value as AiProvider })}><option value="">Not selected</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option><option value="gemini">Google Gemini</option></select></Field><Field label="Model"><input value={draft.aiModel} onChange={(event) => setDraft({ ...draft, aiModel: event.target.value })} /></Field>{draft.aiProvider && <><Field label="API key" full><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={aiKeyStored ? "Stored" : "Paste API key"} /></Field><div className="button-row full"><button className="secondary-button compact-button" onClick={saveAiCredential}>Save key</button><button className="secondary-button compact-button" disabled={!aiKeyStored || !draft.aiModel} onClick={() => safe(async () => { const base: AiUsageRecord = { id: crypto.randomUUID(), provider: draft.aiProvider, model: draft.aiModel, operation: "connection_test", createdAt: new Date().toISOString(), inputTokens: 0, outputTokens: 0, totalTokens: 0, status: "success", errorMessage: "" }; try { const result = await testAi(draft.aiProvider, draft.aiModel); await repository.saveAiUsage({ ...base, inputTokens: result.inputTokens, outputTokens: result.outputTokens, totalTokens: result.totalTokens }); await onReload(); setNotice(`AI connection: ${result.text}`); } catch (reason) { const message = reason instanceof Error ? reason.message : String(reason); await repository.saveAiUsage({ ...base, status: "failed", errorMessage: message.slice(0, 500) }).catch(() => undefined); await onReload(); throw reason; } })}>Test</button>{aiKeyStored && <button className="text-button danger-text" onClick={removeAiCredential}>Remove</button>}</div></>}</div></section>

        <section className="panel settings-connection-panel"><div className="panel-heading"><div><h2>S3</h2></div><span className={`connection-state ${s3KeysStored ? "ready" : ""}`}>{s3KeysStored ? "Credentials stored" : "No credentials"}</span></div><div className="settings-form two-column"><Field label="Bucket"><input value={draft.s3Bucket} onChange={(event) => setDraft({ ...draft, s3Bucket: event.target.value })} /></Field><Field label="Region"><input value={draft.s3Region} onChange={(event) => setDraft({ ...draft, s3Region: event.target.value })} placeholder="auto" /></Field><Field label="Prefix"><input value={draft.s3Prefix} onChange={(event) => setDraft({ ...draft, s3Prefix: event.target.value })} /></Field><Field label="Endpoint"><input value={draft.s3Endpoint} onChange={(event) => setDraft({ ...draft, s3Endpoint: event.target.value })} placeholder="https://ACCOUNT_ID.r2.cloudflarestorage.com" /></Field><Field label="Access key"><input type="password" value={s3Access} onChange={(event) => setS3Access(event.target.value)} placeholder={s3KeysStored ? "Stored" : "Access key"} /></Field><Field label="Secret key"><input type="password" value={s3Secret} onChange={(event) => setS3Secret(event.target.value)} placeholder={s3KeysStored ? "Stored" : "Secret key"} /></Field><div className="button-row full"><button className="secondary-button compact-button" onClick={saveS3Credentials}>Save credentials</button><button className="secondary-button compact-button" disabled={!s3KeysStored} onClick={() => safe(async () => { const result = await testS3(draft); setNotice(`S3 connection: ${result}`); })}>Test</button></div></div></section>
      </div>

      <section className="panel full-span settings-compact-panel"><div className="panel-heading"><div><h2>AI output limits</h2></div></div><div className="limit-grid"><Field label="Company description words"><input type="number" min="10" max="500" value={draft.companyDescriptionMaxWords} onChange={(event) => setDraft({ ...draft, companyDescriptionMaxWords: Number(event.target.value) })} /></Field><Field label="Products/services words"><input type="number" min="5" max="500" value={draft.companyProductsMaxWords} onChange={(event) => setDraft({ ...draft, companyProductsMaxWords: Number(event.target.value) })} /></Field><Field label="Industry words"><input type="number" min="1" max="50" value={draft.companyIndustryMaxWords} onChange={(event) => setDraft({ ...draft, companyIndustryMaxWords: Number(event.target.value) })} /></Field><Field label="Headquarters words"><input type="number" min="1" max="50" value={draft.companyHeadquartersMaxWords} onChange={(event) => setDraft({ ...draft, companyHeadquartersMaxWords: Number(event.target.value) })} /></Field><Field label="Resume max growth %"><input type="number" min="0" max="100" step="1" value={draft.resumeMaxGrowthPercent} onChange={(event) => setDraft({ ...draft, resumeMaxGrowthPercent: Number(event.target.value) })} /></Field><Field label="Cover letter max words"><input type="number" min="50" max="1000" value={draft.coverLetterMaxWords} onChange={(event) => setDraft({ ...draft, coverLetterMaxWords: Number(event.target.value) })} /></Field></div></section>

      <section className="panel full-span settings-compact-panel"><div className="panel-heading"><div><h2>Application backup</h2></div></div><div className="settings-form backup-row"><Field label="Backup location"><select value={backupDestination} onChange={(event) => setBackupDestination(event.target.value as "local" | "s3")}><option value="local">Local</option><option value="s3" disabled={!s3Enabled}>S3</option></select></Field>{backupDestination === "s3" && <><Field label="Available backups"><select value={selectedS3Backup} onChange={(event) => setSelectedS3Backup(event.target.value)}><option value="">Select backup</option>{s3Backups.map((key) => <option key={key} value={key}>{key.split("/").at(-1)}</option>)}</select></Field><button className="secondary-button compact-button align-end" onClick={refreshS3Backups}>Refresh</button></>}<div className="button-row align-end"><button className="secondary-button compact-button" onClick={createBackup}>Create backup</button><button className="secondary-button compact-button" onClick={loadBackup}>Load backup</button></div></div></section>

      <section className="panel full-span settings-compact-panel"><div className="panel-heading"><div><h2>Diagnostics</h2></div><span className="muted">v1.2.11</span></div><div className="button-row"><button className="secondary-button compact-button" onClick={openDiagnosticsFolder}>Open log folder</button><button className="secondary-button compact-button" onClick={copyRecentDiagnostics}>Copy recent log</button><button className="text-button danger-text" onClick={removeDiagnostics}>Clear logs</button></div></section>
    </div> : <div className="settings-grid ai-settings-tab">
      <section className="panel full-span prompt-settings"><div className="panel-heading"><div><h2>AI prompts</h2><p>Customize how each AI task behaves. Core validation, no-fabrication rules, and configured output limits still apply.</p></div><button className="secondary-button compact-button" onClick={() => setDraft({ ...draft, companyDetailsSystemPrompt: DEFAULT_COMPANY_DETAILS_PROMPT, careerEntrySummarySystemPrompt: DEFAULT_CAREER_ENTRY_SUMMARY_PROMPT, careerEntryDescriptionSystemPrompt: DEFAULT_CAREER_ENTRY_DESCRIPTION_PROMPT, careerProfileSystemPrompt: DEFAULT_CAREER_PROFILE_PROMPT, resumeReviewSystemPrompt: DEFAULT_RESUME_REVIEW_PROMPT, coverLetterSystemPrompt: DEFAULT_COVER_LETTER_PROMPT })}>Restore all defaults</button></div>
        <PromptEditor title="Company details" description="Controls how AI fills high-level company information from the company name and website." value={draft.companyDetailsSystemPrompt} rows={7} onChange={(value) => setDraft({ ...draft, companyDetailsSystemPrompt: value })} onRestore={() => setDraft({ ...draft, companyDetailsSystemPrompt: DEFAULT_COMPANY_DETAILS_PROMPT })} />
        <PromptEditor title="Career entry summary" description="Condenses one Career Library entry into reusable evidence for role matching." value={draft.careerEntrySummarySystemPrompt} rows={7} onChange={(value) => setDraft({ ...draft, careerEntrySummarySystemPrompt: value })} onRestore={() => setDraft({ ...draft, careerEntrySummarySystemPrompt: DEFAULT_CAREER_ENTRY_SUMMARY_PROMPT })} />
        <PromptEditor title="Career entry description" description="Creates or refines the detailed narrative for one Career Library entry using only its verified facts." value={draft.careerEntryDescriptionSystemPrompt} rows={8} onChange={(value) => setDraft({ ...draft, careerEntryDescriptionSystemPrompt: value })} onRestore={() => setDraft({ ...draft, careerEntryDescriptionSystemPrompt: DEFAULT_CAREER_ENTRY_DESCRIPTION_PROMPT })} />
        <PromptEditor title="Career profile summary" description="Builds the overall career positioning summary used by resume and cover-letter AI." value={draft.careerProfileSystemPrompt} rows={7} onChange={(value) => setDraft({ ...draft, careerProfileSystemPrompt: value })} onRestore={() => setDraft({ ...draft, careerProfileSystemPrompt: DEFAULT_CAREER_PROFILE_PROMPT })} />
        <PromptEditor title="Resume review" description="Evaluates resume fit against a role and recommends changes only when there is a material gap." value={draft.resumeReviewSystemPrompt} rows={9} onChange={(value) => setDraft({ ...draft, resumeReviewSystemPrompt: value })} onRestore={() => setDraft({ ...draft, resumeReviewSystemPrompt: DEFAULT_RESUME_REVIEW_PROMPT })} />
        <PromptEditor title="Cover letter" description="Generates a concise role-specific cover letter from verified career evidence and application context." value={draft.coverLetterSystemPrompt} rows={9} onChange={(value) => setDraft({ ...draft, coverLetterSystemPrompt: value })} onRestore={() => setDraft({ ...draft, coverLetterSystemPrompt: DEFAULT_COVER_LETTER_PROMPT })} />
      </section>
      <AiUsagePanel data={data} onClear={async () => { if (!window.confirm("Clear cumulative AI usage and recent calls?")) return; await repository.clearAiUsage(); await onReload(); setNotice("AI usage cleared."); }} />
    </div>}

    <div className="settings-save"><span /><button className="primary-button" disabled={working} onClick={saveSettings}>Save settings</button></div>
  </div>;

}



function PromptEditor({ title, description, value, rows, onChange, onRestore }: { title: string; description: string; value: string; rows: number; onChange: (value: string) => void; onRestore: () => void }) {
  return <details className="prompt-editor">
    <summary><div><strong>{title}</strong><span>{description}</span></div></summary>
    <div className="prompt-editor-body"><div className="prompt-editor-actions"><button type="button" className="text-button" onClick={onRestore}>Restore default</button></div><textarea className="code-textarea" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} /></div>
  </details>;
}

function AiUsagePanel({ data, onClear }: { data: AppData; onClear: () => void }) {
  const rows = data.aiUsage.slice(0, 10);
  const totals = data.aiUsageTotals;
  const operationLabel = (value: string) => ({ company_details: "Company details", career_entry_summary: "Career entry summary", career_entry_description: "Career entry description", career_profile_summary: "Career profile summary", resume_review: "Resume review", cover_letter: "Cover letter", connection_test: "Connection test" } as Record<string,string>)[value] ?? value.replaceAll("_", " ");
  const hasUsage = totals.totalCalls > 0 || rows.length > 0;
  return <section className="panel full-span usage-panel">
    <div className="panel-heading"><div><h2>AI usage</h2><p>Cumulative usage since the last clear. Only the 10 most recent calls are retained as detailed activity.</p></div>{hasUsage && <button className="text-button danger-text" onClick={onClear}>Clear usage</button>}</div>
    <div className="usage-summary"><div><span>Calls</span><strong>{totals.totalCalls.toLocaleString()}</strong></div><div><span>Input tokens</span><strong>{totals.inputTokens.toLocaleString()}</strong></div><div><span>Output tokens</span><strong>{totals.outputTokens.toLocaleString()}</strong></div><div><span>Total tokens</span><strong>{totals.totalTokens.toLocaleString()}</strong></div></div>
    <div className="panel-heading"><div><h3>Recent activity</h3></div><span className="muted">Latest {rows.length} of 10 retained calls</span></div>
    {rows.length ? <div className="usage-table"><div className="usage-head"><span>Time</span><span>Action</span><span>Provider / Model</span><span>Input</span><span>Output</span><span>Total</span><span>Status</span></div>{rows.map((item) => <div className="usage-row" key={item.id}><span>{new Date(item.createdAt).toLocaleString()}</span><span>{operationLabel(item.operation)}</span><span className="truncate-cell">{item.provider} · {item.model}</span><span>{item.inputTokens.toLocaleString()}</span><span>{item.outputTokens.toLocaleString()}</span><span>{item.totalTokens.toLocaleString()}</span><span className={`usage-status ${item.status}`}>{item.status === "success" ? "Success" : "Failed"}</span></div>)}</div> : <div className="gentle-note">No recent AI calls.</div>}
  </section>;
}

function CompanyCombobox({ companies, value, onChange }: { companies: Company[]; value: string; onChange: (companyId: string) => void }) {
  const selectedName = companies.find((company) => company.id === value)?.name ?? "";
  const [query, setQuery] = useState(selectedName);
  const [open, setOpen] = useState(false);

  useEffect(() => { setQuery(selectedName); }, [selectedName, value]);

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...companies]
      .filter((company) => !normalized || company.name.toLowerCase().includes(normalized))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [companies, query]);

  return <div className="company-combobox">
    <input
      value={query}
      placeholder="Type to find a company"
      autoComplete="off"
      onFocus={() => setOpen(true)}
      onBlur={() => window.setTimeout(() => { setOpen(false); setQuery((current) => companies.find((company) => company.name.toLowerCase() === current.trim().toLowerCase())?.name ?? selectedName); }, 100)}
      onChange={(event) => {
        const next = event.target.value;
        setQuery(next);
        setOpen(true);
        if (!next.trim()) {
          onChange("");
          return;
        }
        const exact = companies.find((company) => company.name.toLowerCase() === next.trim().toLowerCase());
        if (exact) onChange(exact.id);
      }}
    />
    {open && <div className="company-combobox-menu">
      {matches.length ? matches.map((company) => <button type="button" key={company.id} onMouseDown={(event) => { event.preventDefault(); setQuery(company.name); onChange(company.id); setOpen(false); }}>{company.name}</button>) : <span>No matching company</span>}
    </div>}
  </div>;
}

function EvidencePreview({ data, application }: { data: AppData; application: JobApplication }) {
  const matches = scoreCareerEntries(application.jobDescription, data.careerEntries, 5);
  if (!matches.length) return <div className="gentle-note">No Career Library entry reached the local relevance threshold.</div>;
  return <div className="evidence-preview"><strong>Career evidence selected locally</strong><div>{matches.map((match) => { const entry = data.careerEntries.find((item) => item.id === match.entryId); return entry ? <span key={match.entryId}>{entry.title}<em>{match.score}% relevance</em></span> : null; })}</div></div>;
}

function RoleRow({ data, application, onClick }: { data: AppData; application: JobApplication; onClick: () => void }) {
  return <button className="role-row" onClick={onClick}><div className="role-row-main"><strong>{application.roleTitle || "Role title not recorded"}</strong><span>{companyName(data, application.companyId)}{application.jobId ? ` · ${application.jobId}` : ""}</span></div><span className={`status-pill ${statusMeta[application.status].className}`}>{statusMeta[application.status].label}</span><Icon name="arrow" width="14" /></button>;
}

function DocumentRow({ title, subtitle, current = false, onOpen, onSetCurrent, onDelete }: { title: string; subtitle: string; current?: boolean; onOpen: () => void; onSetCurrent?: () => void; onDelete: () => void }) {
  return <div className="document-row"><div className="document-icon"><Icon name="file" width="19" /></div><div><strong>{title}</strong><span>{subtitle}</span></div>{current && <span className="current-badge">Current</span>}{!current && onSetCurrent && <button className="text-button" onClick={onSetCurrent}>Set current</button>}<button className="icon-button" onClick={onOpen}><Icon name="edit" width="15" /></button><button className="icon-button danger" onClick={onDelete}><Icon name="trash" width="15" /></button></div>;
}

function EmptyState({ title, text, action, onAction, compact = false }: { title: string; text: string; action?: string; onAction?: () => void; compact?: boolean }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}><div className="empty-icon"><Icon name="documents" width="23" /></div><h3>{title}</h3><p>{text}</p>{action && onAction && <button className="secondary-button" onClick={onAction}>{action}</button>}</div>;
}

function Field({ label, children, full = false, required = false, hint }: { label: string; children: ReactNode; full?: boolean; required?: boolean; hint?: string }) {
  return <label className={`field ${full ? "full" : ""}`}><span>{label}{required && <em>*</em>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function FormActions({ onCancel, extra }: { onCancel: () => void; extra?: ReactNode }) {
  return <div className="form-actions full">{extra}<span /><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button">Save</button></div>;
}
