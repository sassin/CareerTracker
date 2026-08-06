import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Icon } from "./components/Icons";
import { Modal } from "./components/Modal";
import {
  careerEntrySummaryPrompt,
  careerProfilePrompt,
  companyProfilePrompt,
  coverLetterPrompt,
  latexPrompt,
  normalizeResumeReview,
  parseJsonObject,
  resumeReviewPrompt,
} from "./lib/ai";
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
import { localResumeAssessment, scoreCareerEntries } from "./lib/matching";
import {
  aiComplete,
  chooseBackupFile,
  chooseDocument,
  chooseFolder,
  compileLatex,
  deleteSecret,
  exportBackup,
  hashTextContent,
  hasSecret,
  importTextDocument,
  migrateWorkspace,
  openLocalPath,
  readBackup,
  saveSecret,
  syncWorkspace,
  testAi,
  testS3,
} from "./lib/native";
import { createRepository } from "./lib/repository";
import {
  AiProvider,
  AppData,
  ApplicationNote,
  ApplicationQuestion,
  ApplicationStatus,
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

export default function App() {
  const [data, setData] = useState<AppData>(emptyData);
  const [view, setView] = useState<View>("overview");
  const [modal, setModal] = useState<ModalName>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [companyDraft, setCompanyDraft] = useState<Company>(newCompany());
  const [applicationDraft, setApplicationDraft] = useState<JobApplication>(newApplication());
  const [resumeDraft, setResumeDraft] = useState<Resume>(newResume());
  const [templateDraft, setTemplateDraft] = useState<CoverLetterTemplate>(newCoverLetterTemplate());
  const [letterDraft, setLetterDraft] = useState<CoverLetter>(newCoverLetter());
  const [questionDraft, setQuestionDraft] = useState<Question>(newQuestion());
  const [careerDraft, setCareerDraft] = useState<CareerEntry>(newCareerEntry());
  const [applicationQuestionDraft, setApplicationQuestionDraft] = useState<ApplicationQuestion>(newApplicationQuestion());
  const [noteDraft, setNoteDraft] = useState<ApplicationNote>(newApplicationNote());

  const reload = async () => setData(await repository.load());

  useEffect(() => {
    repository.initialize().then(reload).catch((reason) => setError(String(reason))).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
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

  function openResume(resume?: Resume) {
    setResumeDraft(resume ? { ...resume } : newResume());
    setModal("resume");
  }

  function openTemplate(template?: CoverLetterTemplate) {
    setTemplateDraft(template ? { ...template } : newCoverLetterTemplate());
    setModal("template");
  }

  function openLetter(letter?: CoverLetter, companyId = "") {
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
      await repository.saveResume({ ...resumeDraft, contentHash });
      await reload();
      setModal(null);
      setNotice("Resume saved.");
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
      await repository.saveCoverLetterTemplate({ ...templateDraft, contentHash });
      await reload();
      setModal(null);
      setNotice("Cover letter format saved.");
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
      setModal(null);
      setNotice("Cover letter saved.");
    });
  }

  async function saveQuestion(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      if (!questionDraft.questionText.trim()) throw new Error("Enter the question.");
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
      if (data.settings.currentResumeId === id) { setError("Choose a different Current Resume before deleting this one."); return; }
      if (data.applications.some((item) => item.resumeId === id)) { setError("This resume is linked to one or more roles. Change those roles before deleting it."); return; }
    }
    if (entity === "coverLetterTemplate" && data.settings.coverLetterTemplateId === id) { setError("Choose a different cover letter format before deleting this one."); return; }
    if (entity === "coverLetter" && data.applications.some((item) => item.coverLetterId === id)) { setError("This cover letter is linked to one or more roles. Change those roles before deleting it."); return; }
    const companyRoleCount = entity === "company" ? data.applications.filter((item) => item.companyId === id).length : 0;
    const confirmation = companyRoleCount
      ? `Delete ${label} and its ${companyRoleCount} linked role${companyRoleCount === 1 ? "" : "s"}? Role questions, notes, and company cover letters will also be deleted. Shared resumes and Career Library entries will remain.`
      : `Delete ${label}? This cannot be undone.`;
    if (!window.confirm(confirmation)) return;
    await run(async () => {
      await repository.deleteEntity(entity, id);
      const settings = { ...data.settings };
      if (entity === "resume" && settings.currentResumeId === id) settings.currentResumeId = "";
      if (entity === "coverLetterTemplate" && settings.coverLetterTemplateId === id) settings.coverLetterTemplateId = "";
      if (entity === "resume" || entity === "coverLetterTemplate") await repository.saveSettings(settings);
      await reload();
      setModal(nextModal);
      setNotice(`${label} deleted.`);
    });
  }

  async function importResume(markCurrent: boolean, forApplication = false) {
    await run(async () => {
      const path = await chooseDocument();
      if (!path) return;
      const imported = await importTextDocument(path);
      let resume = data.resumes.find((item) => item.contentHash === imported.contentHash);
      if (!resume) {
        resume = { ...newResume(), name: imported.displayName, sourceType: imported.sourceType, editableText: imported.text, contentHash: imported.contentHash, latexText: imported.sourceType === "latex" ? imported.text : "" };
        await repository.saveResume(resume);
      }
      if (markCurrent) await repository.saveSettings({ ...data.settings, currentResumeId: resume.id });
      if (forApplication) setApplicationDraft((current) => ({ ...current, resumeId: resume!.id }));
      await reload();
      setNotice(resume === data.resumes.find((item) => item.contentHash === imported.contentHash) ? "Existing resume selected." : "Resume imported.");
    });
  }

  async function importTemplate() {
    await run(async () => {
      const path = await chooseDocument();
      if (!path) return;
      const imported = await importTextDocument(path);
      let template = data.coverLetterTemplates.find((item) => item.contentHash === imported.contentHash);
      if (!template) {
        template = { ...newCoverLetterTemplate(), name: imported.displayName, sourceType: imported.sourceType, editableText: imported.text, contentHash: imported.contentHash, latexText: imported.sourceType === "latex" ? imported.text : "" };
        await repository.saveCoverLetterTemplate(template);
      }
      await repository.saveSettings({ ...data.settings, coverLetterTemplateId: template.id });
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
        letter = { ...newCoverLetter(applicationDraft.companyId), name: imported.displayName, roleFamily: applicationDraft.roleTitle, sourceType: imported.sourceType, editableText: imported.text, contentHash: imported.contentHash, latexText: imported.sourceType === "latex" ? imported.text : "" };
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
      const raw = await aiComplete(data.settings.aiProvider, data.settings.aiModel, companyProfilePrompt(companyDraft));
      const result = parseJsonObject<{ verified: boolean; shortDescription: string; industry: string; productsServices: string; headquarters: string }>(raw);
      if (!result.verified) {
        setNotice("The company could not be identified reliably. Complete the details manually.");
        return;
      }
      setCompanyDraft((current) => ({ ...current, shortDescription: result.shortDescription || current.shortDescription, industry: result.industry || current.industry, productsServices: result.productsServices || current.productsServices, headquarters: result.headquarters || current.headquarters }));
      setNotice("Company fields filled. Review before saving.");
    });
  }

  async function createCareerEntrySummary() {
    await run(async () => {
      ensureAiReady();
      const raw = await aiComplete(data.settings.aiProvider, data.settings.aiModel, careerEntrySummaryPrompt(careerDraft));
      const result = parseJsonObject<{ summary: string }>(raw);
      setCareerDraft((current) => ({ ...current, entrySummary: result.summary }));
    });
  }

  async function generateCareerProfile() {
    await run(async () => {
      ensureAiReady();
      if (!data.careerEntries.length) throw new Error("Add Career Library entries first.");
      const raw = await aiComplete(data.settings.aiProvider, data.settings.aiModel, careerProfilePrompt(data.careerEntries));
      const result = parseJsonObject<{ summary: string }>(raw);
      const settings = { ...data.settings, careerProfileSummary: result.summary };
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

  async function reviewResumeAndPrepare() {
    await run(async () => {
      ensureAiReady();
      const resume = data.resumes.find((item) => item.id === applicationDraft.resumeId);
      if (!resume) throw new Error("Select or upload a resume for this role.");
      if (!applicationDraft.jobDescription.trim()) throw new Error("Add the job description first.");
      const evidence = selectedEvidence(applicationDraft);
      const company = data.companies.find((item) => item.id === applicationDraft.companyId);
      const template = currentTemplate(data);
      const createCoverLetter = !applicationDraft.coverLetterId && Boolean(applicationDraft.companyId);
      const raw = await aiComplete(data.settings.aiProvider, data.settings.aiModel, resumeReviewPrompt({ company, application: applicationDraft, resume, careerProfileSummary: data.settings.careerProfileSummary, evidence, createCoverLetter, coverLetterSample: template?.editableText ?? "" }));
      const result = normalizeResumeReview(parseJsonObject<ResumeReviewResult>(raw), resume.editableText);
      let coverLetterId = applicationDraft.coverLetterId;
      if (createCoverLetter && result.coverLetterText.trim()) {
        const hash = await hashTextContent(result.coverLetterText);
        const existing = data.coverLetters.find((item) => item.companyId === applicationDraft.companyId && item.contentHash === hash);
        if (existing) coverLetterId = existing.id;
        else {
          const letter = { ...newCoverLetter(applicationDraft.companyId), name: `${company?.name || "Company"} — ${applicationDraft.roleTitle || "Role"}`, roleFamily: applicationDraft.roleTitle, editableText: result.coverLetterText, contentHash: hash };
          await repository.saveCoverLetter(letter);
          coverLetterId = letter.id;
        }
      }
      const next = {
        ...applicationDraft,
        coverLetterId,
        aiAssessment: result.assessment,
        resumeChangeNotes: [...result.suggestedChanges, ...(result.unsupportedRequirements.length ? [`Unsupported requirements: ${result.unsupportedRequirements.join(", ")}`] : [])].join("\n"),
        suggestedResumeText: result.updatedResumeText,
        selectedEvidenceJson: JSON.stringify(result.evidenceUsed),
      };
      setApplicationDraft(next);
      await repository.saveApplication(next);
      await reload();
      setNotice("Review completed. The original resume was not changed.");
    });
  }

  async function createCoverLetterForApplication() {
    await run(async () => {
      ensureAiReady();
      if (!applicationDraft.companyId) throw new Error("Select a company first.");
      if (!applicationDraft.jobDescription.trim()) throw new Error("Add the job description first.");
      const company = data.companies.find((item) => item.id === applicationDraft.companyId);
      const resume = data.resumes.find((item) => item.id === applicationDraft.resumeId);
      const evidence = selectedEvidence(applicationDraft);
      const raw = await aiComplete(data.settings.aiProvider, data.settings.aiModel, coverLetterPrompt({ company, application: applicationDraft, resume, careerProfileSummary: data.settings.careerProfileSummary, evidence, coverLetterSample: currentTemplate(data)?.editableText ?? "" }));
      const result = parseJsonObject<{ coverLetterText: string }>(raw);
      if (!result.coverLetterText.trim()) throw new Error("The provider returned an empty cover letter.");
      const hash = await hashTextContent(result.coverLetterText);
      const existing = data.coverLetters.find((item) => item.companyId === applicationDraft.companyId && item.contentHash === hash);
      let id = existing?.id;
      if (!id) {
        const letter = { ...newCoverLetter(applicationDraft.companyId), name: `${company?.name || "Company"} — ${applicationDraft.roleTitle || "Role"}`, roleFamily: applicationDraft.roleTitle, editableText: result.coverLetterText, contentHash: hash };
        await repository.saveCoverLetter(letter);
        id = letter.id;
      }
      setApplicationDraft((current) => ({ ...current, coverLetterId: id! }));
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
        const resume = { ...newResume(), name: `${companyName(data, applicationDraft.companyId)} — ${applicationDraft.roleTitle || "Role"}`, sourceType: original?.sourceType ?? "text", editableText: applicationDraft.suggestedResumeText, contentHash: hash };
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

  async function createLatexForResume() {
    await run(async () => {
      ensureAiReady();
      const reference = currentResume(data)?.latexText || "";
      const raw = await aiComplete(data.settings.aiProvider, data.settings.aiModel, latexPrompt("resume", resumeDraft.editableText, reference));
      const result = parseJsonObject<{ latex: string }>(raw);
      setResumeDraft((current) => ({ ...current, latexText: result.latex }));
      setNotice("LaTeX created. Review it before compiling.");
    });
  }

  async function createLatexForLetter() {
    await run(async () => {
      ensureAiReady();
      const raw = await aiComplete(data.settings.aiProvider, data.settings.aiModel, latexPrompt("cover_letter", letterDraft.editableText, currentTemplate(data)?.latexText || currentTemplate(data)?.editableText || ""));
      const result = parseJsonObject<{ latex: string }>(raw);
      setLetterDraft((current) => ({ ...current, latexText: result.latex }));
      setNotice("LaTeX created. Review it before compiling.");
    });
  }

  async function compileResumePdf() {
    await run(async () => {
      const pdfPath = await compileLatex(resumeDraft.latexText, data.settings.workspacePath, resumeDraft.id, "resume", data.settings.tectonicPath);
      setResumeDraft((current) => ({ ...current, pdfPath }));
      setNotice("Resume PDF created.");
    });
  }

  async function compileLetterPdf() {
    await run(async () => {
      const pdfPath = await compileLatex(letterDraft.latexText, data.settings.workspacePath, letterDraft.id, "cover_letter", data.settings.tectonicPath);
      setLetterDraft((current) => ({ ...current, pdfPath }));
      setNotice("Cover letter PDF created.");
    });
  }

  const filteredApplications = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.applications.filter((application) => !query || `${application.roleTitle} ${companyName(data, application.companyId)} ${application.jobId} ${application.status}`.toLowerCase().includes(query));
  }, [data, search]);

  const current = currentResume(data);
  const template = currentTemplate(data);

  if (loading) return <div className="loading-screen">Opening CareerTracker…</div>;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Icon name="applications" width="22" /></div><div><strong>CareerTracker</strong><span>Application workspace</span></div></div>
        <nav>{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><Icon name={item.icon} width="19" />{item.label}</button>)}</nav>
        <div className="sidebar-note"><strong>Manual first</strong><span>AI actions are optional and never overwrite your records.</span></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><h1>{navItems.find((item) => item.id === view)?.label}</h1><p>{view === "overview" ? "A focused view of your job search." : ""}</p></div>
          <div className="topbar-actions">
            {(view === "overview" || view === "applications") && <button className="primary-button" onClick={() => openApplication()}><Icon name="plus" width="16" />Add role</button>}
          </div>
        </header>

        {error && <div className="alert error"><Icon name="warning" width="18" /><span>{error}</span><button onClick={() => setError("")}><Icon name="close" width="15" /></button></div>}
        {notice && <div className="alert success"><Icon name="check" width="18" /><span>{notice}</span></div>}

        {view === "overview" && <OverviewView data={data} current={current} template={template} onAddRole={() => openApplication()} onOpenRole={(item) => openApplication(item)} onUploadCurrent={() => importResume(true)} onUploadTemplate={importTemplate} onOpenResume={() => current && openResume(current)} onOpenTemplate={() => template && openTemplate(template)} />}
        {view === "applications" && <ApplicationsView data={data} applications={filteredApplications} search={search} setSearch={setSearch} onOpen={(item) => openApplication(item)} onDelete={(item) => deleteItem("application", item.id, "role")} />}
        {view === "companies" && <CompaniesView data={data} onAdd={() => openCompany()} onOpen={openCompany} onAddRole={(id) => openApplication(undefined, id)} onDelete={(item) => deleteItem("company", item.id, "company and its roles")} />}
        {view === "documents" && <DocumentsView data={data} onUploadCurrent={() => importResume(true)} onAddResume={() => openResume()} onEditResume={openResume} onDeleteResume={(item) => deleteItem("resume", item.id, "resume")} onSetCurrent={async (id) => { await repository.saveSettings({ ...data.settings, currentResumeId: id }); await reload(); }} onUploadTemplate={importTemplate} onAddTemplate={() => openTemplate()} onEditTemplate={openTemplate} onDeleteTemplate={(item) => deleteItem("coverLetterTemplate", item.id, "cover letter format")} onSetTemplate={async (id) => { await repository.saveSettings({ ...data.settings, coverLetterTemplateId: id }); await reload(); }} onAddLetter={() => openLetter()} onEditLetter={openLetter} onDeleteLetter={(item) => deleteItem("coverLetter", item.id, "cover letter")} />}
        {view === "questions" && <QuestionsView data={data} onAdd={() => { setQuestionDraft(newQuestion()); setModal("question"); }} onEdit={(item) => { setQuestionDraft({ ...item }); setModal("question"); }} onDelete={(item) => deleteItem("question", item.id, "question")} />}
        {view === "library" && <CareerLibraryView data={data} busy={busy} onSaveProfile={async (summary) => { await repository.saveSettings({ ...data.settings, careerProfileSummary: summary }); await reload(); setNotice("Career profile saved."); }} onGenerateProfile={generateCareerProfile} onAdd={() => { setCareerDraft(newCareerEntry()); setModal("career"); }} onEdit={(item) => { setCareerDraft({ ...item }); setModal("career"); }} onDelete={(item) => deleteItem("careerEntry", item.id, "career entry")} />}
        {view === "settings" && <SettingsView data={data} onReload={reload} setNotice={setNotice} setError={setError} />}
      </main>

      {modal === "company" && <Modal title={companyDraft.name ? "Edit company" : "Add company"} subtitle="Only the company name is required. AI-assisted fields remain editable." onClose={() => setModal(null)} wide>
        <form className="form-grid" onSubmit={saveCompany}>
          <Field label="Company name" required><input value={companyDraft.name} onChange={(event) => setCompanyDraft({ ...companyDraft, name: event.target.value })} /></Field>
          <Field label="Website"><input value={companyDraft.website} onChange={(event) => setCompanyDraft({ ...companyDraft, website: event.target.value })} /></Field>
          <Field label="Short description" full><textarea rows={3} value={companyDraft.shortDescription} onChange={(event) => setCompanyDraft({ ...companyDraft, shortDescription: event.target.value })} /></Field>
          <Field label="Industry"><input value={companyDraft.industry} onChange={(event) => setCompanyDraft({ ...companyDraft, industry: event.target.value })} /></Field>
          <Field label="Headquarters"><input value={companyDraft.headquarters} onChange={(event) => setCompanyDraft({ ...companyDraft, headquarters: event.target.value })} /></Field>
          <Field label="Products or services" full><textarea rows={3} value={companyDraft.productsServices} onChange={(event) => setCompanyDraft({ ...companyDraft, productsServices: event.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={4} value={companyDraft.notes} onChange={(event) => setCompanyDraft({ ...companyDraft, notes: event.target.value })} /></Field>
          <FormActions onCancel={() => setModal(null)} extra={data.settings.aiEnabled && <button type="button" className="secondary-button" disabled={busy || !companyDraft.name.trim()} onClick={fillCompanyWithAi}><Icon name="spark" width="15" />Fill details with AI</button>} />
        </form>
      </Modal>}

      {modal === "application" && <Modal title={applicationDraft.roleTitle ? "Edit role" : "Add role"} subtitle="All role fields are optional. Save what you have and complete it later." onClose={() => setModal(null)} wide>
        <form className="form-grid" onSubmit={saveApplication}>
          <Field label="Company"><select value={applicationDraft.companyId} onChange={(event) => setApplicationDraft({ ...applicationDraft, companyId: event.target.value, coverLetterId: "" })}><option value="">Not selected</option>{data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
          <Field label="Role title"><input value={applicationDraft.roleTitle} onChange={(event) => setApplicationDraft({ ...applicationDraft, roleTitle: event.target.value })} /></Field>
          <Field label="Job ID"><input value={applicationDraft.jobId} onChange={(event) => setApplicationDraft({ ...applicationDraft, jobId: event.target.value })} /></Field>
          <Field label="Job URL"><input value={applicationDraft.jobUrl} onChange={(event) => setApplicationDraft({ ...applicationDraft, jobUrl: event.target.value })} /></Field>
          <Field label="Location"><input value={applicationDraft.location} onChange={(event) => setApplicationDraft({ ...applicationDraft, location: event.target.value })} /></Field>
          <Field label="Work arrangement"><input value={applicationDraft.workArrangement} onChange={(event) => setApplicationDraft({ ...applicationDraft, workArrangement: event.target.value })} placeholder="Remote, hybrid, on-site" /></Field>
          <Field label="Date applied"><input type="date" value={applicationDraft.dateApplied} onChange={(event) => setApplicationDraft({ ...applicationDraft, dateApplied: event.target.value })} /></Field>
          <Field label="Status"><select value={applicationDraft.status} onChange={(event) => setApplicationDraft({ ...applicationDraft, status: event.target.value as ApplicationStatus })}>{Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></Field>
          <Field label="Job description" full><textarea rows={10} value={applicationDraft.jobDescription} onChange={(event) => setApplicationDraft({ ...applicationDraft, jobDescription: event.target.value })} /></Field>

          <section className="embedded-section full">
            <div className="section-heading"><div><h3>Resume</h3><p>Select an existing resume or upload one for this role. Application uploads do not replace Current Resume.</p></div><button type="button" className="secondary-button" onClick={() => importResume(false, true)}><Icon name="upload" width="15" />Upload</button></div>
            <select value={applicationDraft.resumeId} onChange={(event) => setApplicationDraft({ ...applicationDraft, resumeId: event.target.value })}><option value="">Not selected</option>{data.resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.name}</option>)}</select>
            {applicationDraft.resumeId && <p className="muted">Selected: {resumeName(data, applicationDraft.resumeId)}</p>}
          </section>

          <section className="embedded-section full">
            <div className="section-heading"><div><h3>Cover letter</h3><p>Select a letter from this company, upload one, or create one with AI.</p></div><div className="button-row"><button type="button" className="secondary-button" onClick={importApplicationCoverLetter}><Icon name="upload" width="15" />Upload</button>{data.settings.aiEnabled && <button type="button" className="secondary-button" disabled={busy} onClick={createCoverLetterForApplication}><Icon name="spark" width="15" />Create cover letter</button>}</div></div>
            <select value={applicationDraft.coverLetterId} onChange={(event) => setApplicationDraft({ ...applicationDraft, coverLetterId: event.target.value })}><option value="">Not selected</option>{data.coverLetters.filter((letter) => letter.companyId === applicationDraft.companyId).map((letter) => <option key={letter.id} value={letter.id}>{letter.name}</option>)}</select>
          </section>

          <section className="embedded-section full ai-workspace">
            <div className="section-heading"><div><h3>Resume review</h3><p>AI receives the job description, selected resume, career profile, and up to five high-match Career Library entries.</p></div>{data.settings.aiEnabled && <button type="button" className="primary-button" disabled={busy} onClick={reviewResumeAndPrepare}><Icon name="spark" width="15" />Review resume and prepare</button>}</div>
            {applicationDraft.jobDescription && data.careerEntries.length > 0 && <EvidencePreview data={data} application={applicationDraft} />}
            {!data.settings.aiEnabled && applicationDraft.resumeId && applicationDraft.jobDescription && <div className="gentle-note">{localResumeAssessment(applicationDraft.jobDescription, data.resumes.find((item) => item.id === applicationDraft.resumeId)?.editableText ?? "", data.careerEntries)}</div>}
            {applicationDraft.aiAssessment && <div className="review-result"><strong>Assessment</strong><p>{applicationDraft.aiAssessment}</p></div>}
            {applicationDraft.resumeChangeNotes && <Field label="Recommended changes"><textarea rows={5} value={applicationDraft.resumeChangeNotes} onChange={(event) => setApplicationDraft({ ...applicationDraft, resumeChangeNotes: event.target.value })} /></Field>}
            {applicationDraft.suggestedResumeText && <><Field label="Suggested resume text"><textarea rows={16} value={applicationDraft.suggestedResumeText} onChange={(event) => setApplicationDraft({ ...applicationDraft, suggestedResumeText: event.target.value })} /></Field><button type="button" className="secondary-button" onClick={saveSuggestedResume}>Save as resume variation</button></>}
          </section>

          <Field label="General notes" full><textarea rows={5} value={applicationDraft.generalNotes} onChange={(event) => setApplicationDraft({ ...applicationDraft, generalNotes: event.target.value })} /></Field>

          {data.applications.some((item) => item.id === applicationDraft.id) && <section className="embedded-section full">
            <div className="section-heading"><div><h3>Application questions</h3><p>Store only the exact questions and answers submitted for this role.</p></div><button type="button" className="secondary-button" onClick={() => { setApplicationQuestionDraft(newApplicationQuestion(applicationDraft.id)); setModal("applicationQuestion"); }}><Icon name="plus" width="15" />Add question</button></div>
            {data.applicationQuestions.filter((item) => item.applicationId === applicationDraft.id).map((item) => <div className="mini-record" key={item.id}><div><strong>{item.questionText}</strong><span>{item.submittedAnswer || "No answer recorded"}</span></div><div><button type="button" className="icon-button" onClick={() => { setApplicationQuestionDraft({ ...item }); setModal("applicationQuestion"); }}><Icon name="edit" width="15" /></button><button type="button" className="icon-button danger" onClick={() => deleteItem("applicationQuestion", item.id, "application question", "application")}><Icon name="trash" width="15" /></button></div></div>)}
          </section>}

          {data.applications.some((item) => item.id === applicationDraft.id) && <section className="embedded-section full">
            <div className="section-heading"><div><h3>Notes</h3><p>HR, hiring manager, referral, or general notes aligned to this role.</p></div><button type="button" className="secondary-button" onClick={() => { setNoteDraft(newApplicationNote(applicationDraft.id)); setModal("note"); }}><Icon name="plus" width="15" />Add note</button></div>
            {data.notes.filter((item) => item.applicationId === applicationDraft.id).map((item) => <div className="mini-record" key={item.id}><div><strong>{item.title || item.noteType.replace("_", " ")}</strong><span>{item.content}</span></div><div><button type="button" className="icon-button" onClick={() => { setNoteDraft({ ...item }); setModal("note"); }}><Icon name="edit" width="15" /></button><button type="button" className="icon-button danger" onClick={() => deleteItem("note", item.id, "note", "application")}><Icon name="trash" width="15" /></button></div></div>)}
          </section>}

          <FormActions onCancel={() => setModal(null)} extra={data.applications.some((item) => item.id === applicationDraft.id) && <button type="button" className="danger-button" onClick={() => deleteItem("application", applicationDraft.id, "role")}><Icon name="trash" width="15" />Delete role</button>} />
        </form>
      </Modal>}

      {modal === "resume" && <Modal title={resumeDraft.name ? "Edit resume" : "Add resume"} subtitle="Resume text is the source of truth. LaTeX and PDF are optional exports." onClose={() => setModal(null)} wide>
        <form className="form-grid" onSubmit={saveResume}>
          <Field label="Name" required><input value={resumeDraft.name} onChange={(event) => setResumeDraft({ ...resumeDraft, name: event.target.value })} /></Field>
          <Field label="Source format"><select value={resumeDraft.sourceType} onChange={(event) => setResumeDraft({ ...resumeDraft, sourceType: event.target.value as Resume["sourceType"] })}><option value="text">Text</option><option value="latex">LaTeX</option><option value="pdf">Extracted PDF text</option></select></Field>
          <Field label="Resume text" full required><textarea className="code-textarea" rows={20} value={resumeDraft.editableText} onChange={(event) => setResumeDraft({ ...resumeDraft, editableText: event.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={3} value={resumeDraft.notes} onChange={(event) => setResumeDraft({ ...resumeDraft, notes: event.target.value })} /></Field>
          <section className="embedded-section full"><div className="section-heading"><div><h3>LaTeX and PDF export</h3><p>Create LaTeX explicitly, review it, then compile with Tectonic.</p></div>{data.settings.aiEnabled && <button type="button" className="secondary-button" onClick={createLatexForResume}><Icon name="spark" width="15" />Create LaTeX</button>}</div><textarea className="code-textarea" rows={14} value={resumeDraft.latexText} onChange={(event) => setResumeDraft({ ...resumeDraft, latexText: event.target.value })} placeholder="LaTeX appears here." /><div className="button-row"><button type="button" className="secondary-button" disabled={!resumeDraft.latexText.trim()} onClick={compileResumePdf}>Compile PDF</button>{resumeDraft.pdfPath && <button type="button" className="text-button" onClick={() => openLocalPath(resumeDraft.pdfPath)}>Open PDF</button>}</div></section>
          <FormActions onCancel={() => setModal(null)} extra={data.resumes.some((item) => item.id === resumeDraft.id) && <button type="button" className="danger-button" onClick={() => deleteItem("resume", resumeDraft.id, "resume")}><Icon name="trash" width="15" />Delete</button>} />
        </form>
      </Modal>}

      {modal === "template" && <Modal title={templateDraft.name ? "Edit cover letter format" : "Add cover letter format"} subtitle="Store a sample as text or LaTeX. The latest uploaded sample becomes the selected format." onClose={() => setModal(null)} wide>
        <form className="form-grid" onSubmit={saveTemplate}>
          <Field label="Name" required><input value={templateDraft.name} onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })} /></Field>
          <Field label="Source format"><select value={templateDraft.sourceType} onChange={(event) => setTemplateDraft({ ...templateDraft, sourceType: event.target.value as CoverLetterTemplate["sourceType"] })}><option value="text">Text</option><option value="latex">LaTeX</option><option value="pdf">Extracted PDF text</option></select></Field>
          <Field label="Sample text" full required><textarea className="code-textarea" rows={18} value={templateDraft.editableText} onChange={(event) => setTemplateDraft({ ...templateDraft, editableText: event.target.value })} /></Field>
          <Field label="LaTeX format reference" full><textarea className="code-textarea" rows={12} value={templateDraft.latexText} onChange={(event) => setTemplateDraft({ ...templateDraft, latexText: event.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={3} value={templateDraft.notes} onChange={(event) => setTemplateDraft({ ...templateDraft, notes: event.target.value })} /></Field>
          <FormActions onCancel={() => setModal(null)} extra={data.coverLetterTemplates.some((item) => item.id === templateDraft.id) && <button type="button" className="danger-button" onClick={() => deleteItem("coverLetterTemplate", templateDraft.id, "cover letter format")}><Icon name="trash" width="15" />Delete</button>} />
        </form>
      </Modal>}

      {modal === "letter" && <Modal title={letterDraft.name ? "Edit cover letter" : "Add cover letter"} subtitle="Cover letters remain company-specific and may be reused across that company’s roles." onClose={() => setModal(null)} wide>
        <form className="form-grid" onSubmit={saveLetter}>
          <Field label="Company"><select value={letterDraft.companyId} onChange={(event) => setLetterDraft({ ...letterDraft, companyId: event.target.value })}><option value="">Not selected</option>{data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
          <Field label="Name" required><input value={letterDraft.name} onChange={(event) => setLetterDraft({ ...letterDraft, name: event.target.value })} /></Field>
          <Field label="Role or role family"><input value={letterDraft.roleFamily} onChange={(event) => setLetterDraft({ ...letterDraft, roleFamily: event.target.value })} /></Field>
          <Field label="Source format"><select value={letterDraft.sourceType} onChange={(event) => setLetterDraft({ ...letterDraft, sourceType: event.target.value as CoverLetter["sourceType"] })}><option value="text">Text</option><option value="latex">LaTeX</option><option value="pdf">Extracted PDF text</option></select></Field>
          <Field label="Cover letter text" full required><textarea rows={18} value={letterDraft.editableText} onChange={(event) => setLetterDraft({ ...letterDraft, editableText: event.target.value })} /></Field>
          <section className="embedded-section full"><div className="section-heading"><div><h3>LaTeX and PDF export</h3><p>Formatting is derived from the selected cover letter format when available.</p></div>{data.settings.aiEnabled && <button type="button" className="secondary-button" onClick={createLatexForLetter}><Icon name="spark" width="15" />Create LaTeX</button>}</div><textarea className="code-textarea" rows={12} value={letterDraft.latexText} onChange={(event) => setLetterDraft({ ...letterDraft, latexText: event.target.value })} /><div className="button-row"><button type="button" className="secondary-button" disabled={!letterDraft.latexText.trim()} onClick={compileLetterPdf}>Compile PDF</button>{letterDraft.pdfPath && <button type="button" className="text-button" onClick={() => openLocalPath(letterDraft.pdfPath)}>Open PDF</button>}</div></section>
          <Field label="Notes" full><textarea rows={3} value={letterDraft.notes} onChange={(event) => setLetterDraft({ ...letterDraft, notes: event.target.value })} /></Field>
          <FormActions onCancel={() => setModal(null)} extra={data.coverLetters.some((item) => item.id === letterDraft.id) && <button type="button" className="danger-button" onClick={() => deleteItem("coverLetter", letterDraft.id, "cover letter")}><Icon name="trash" width="15" />Delete</button>} />
        </form>
      </Modal>}

      {modal === "question" && <Modal title={questionDraft.questionText ? "Edit question" : "Add question"} onClose={() => setModal(null)}>
        <form className="form-grid" onSubmit={saveQuestion}>
          <Field label="Scope"><select value={questionDraft.scope} onChange={(event) => setQuestionDraft({ ...questionDraft, scope: event.target.value as Question["scope"], companyId: event.target.value === "generic" ? "" : questionDraft.companyId })}><option value="generic">Generic</option><option value="company">Company-specific</option></select></Field>
          {questionDraft.scope === "company" && <Field label="Company"><select value={questionDraft.companyId} onChange={(event) => setQuestionDraft({ ...questionDraft, companyId: event.target.value })}><option value="">Not selected</option>{data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>}
          <Field label="Question" full required><textarea rows={4} value={questionDraft.questionText} onChange={(event) => setQuestionDraft({ ...questionDraft, questionText: event.target.value })} /></Field>
          <Field label="Reusable answer" full><textarea rows={8} value={questionDraft.reusableAnswer} onChange={(event) => setQuestionDraft({ ...questionDraft, reusableAnswer: event.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={3} value={questionDraft.notes} onChange={(event) => setQuestionDraft({ ...questionDraft, notes: event.target.value })} /></Field>
          <FormActions onCancel={() => setModal(null)} />
        </form>
      </Modal>}

      {modal === "career" && <Modal title={careerDraft.title ? "Edit career entry" : "Add career entry"} subtitle="Store verified facts and a concise editable summary." onClose={() => setModal(null)} wide>
        <form className="form-grid" onSubmit={saveCareer}>
          <Field label="Category"><select value={careerDraft.category} onChange={(event) => setCareerDraft({ ...careerDraft, category: event.target.value as CareerEntryCategory })}><option value="career_work">Career work</option><option value="project">Project</option><option value="achievement">Achievement</option><option value="skill">Skill</option><option value="certification">Certification</option><option value="career_story">Career story</option></select></Field>
          <Field label="Title" required><input value={careerDraft.title} onChange={(event) => setCareerDraft({ ...careerDraft, title: event.target.value })} /></Field>
          <Field label="Organization"><input value={careerDraft.organization} onChange={(event) => setCareerDraft({ ...careerDraft, organization: event.target.value })} /></Field>
          <Field label="Skills"><input value={careerDraft.skills} onChange={(event) => setCareerDraft({ ...careerDraft, skills: event.target.value })} placeholder="Comma-separated" /></Field>
          <Field label="Entry summary" full><textarea rows={4} value={careerDraft.entrySummary} onChange={(event) => setCareerDraft({ ...careerDraft, entrySummary: event.target.value })} /></Field>
          <div className="full button-row">{data.settings.aiEnabled && <button type="button" className="secondary-button" disabled={busy} onClick={createCareerEntrySummary}><Icon name="spark" width="15" />Create summary</button>}</div>
          <Field label="Detailed description" full><textarea rows={10} value={careerDraft.detailedDescription} onChange={(event) => setCareerDraft({ ...careerDraft, detailedDescription: event.target.value })} /></Field>
          <Field label="Technologies"><input value={careerDraft.technologies} onChange={(event) => setCareerDraft({ ...careerDraft, technologies: event.target.value })} /></Field>
          <Field label="Results or metrics"><input value={careerDraft.resultsMetrics} onChange={(event) => setCareerDraft({ ...careerDraft, resultsMetrics: event.target.value })} /></Field>
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

function OverviewView({ data, current, template, onAddRole, onOpenRole, onUploadCurrent, onUploadTemplate, onOpenResume, onOpenTemplate }: {
  data: AppData; current?: Resume; template?: CoverLetterTemplate; onAddRole: () => void; onOpenRole: (item: JobApplication) => void; onUploadCurrent: () => void; onUploadTemplate: () => void; onOpenResume: () => void; onOpenTemplate: () => void;
}) {
  const active = data.applications.filter((item) => item.status !== "success" && item.status !== "learning_experience").slice(0, 8);
  return <div className="page-stack">
    <section className="summary-grid">{overviewStatuses.map((status) => <div className="summary-card" key={status}><span>{statusMeta[status].label}</span><strong>{data.applications.filter((item) => item.status === status).length}</strong></div>)}</section>
    <section className="panel full-width"><div className="panel-heading"><div><h2>Active roles</h2><p>Roles that still need preparation or follow-up.</p></div><button className="secondary-button" onClick={onAddRole}><Icon name="plus" width="15" />Add role</button></div>{active.length ? <div className="role-list">{active.map((item) => <RoleRow key={item.id} data={data} application={item} onClick={() => onOpenRole(item)} />)}</div> : <EmptyState title="No active roles" text="Add the first role you want to prepare or track." action="Add role" onAction={onAddRole} />}</section>
    <section className="bottom-document-grid">
      <div className="panel compact-panel"><div className="panel-heading"><div><h2>Current Resume</h2><p>The source used for future role variations.</p></div></div>{current ? <DocumentSummary title={current.name} subtitle={`${current.sourceType.toUpperCase()} · ${current.editableText.length.toLocaleString()} characters`} onOpen={onOpenResume} action="Open" /> : <EmptyState compact title="No current resume" text="Upload PDF, text, or LaTeX. The latest upload here becomes Current Resume." action="Upload resume" onAction={onUploadCurrent} />}<button className="text-button document-upload-link" onClick={onUploadCurrent}><Icon name="upload" width="14" />Upload latest resume</button></div>
      <div className="panel compact-panel"><div className="panel-heading"><div><h2>Cover Letter Format</h2><p>Sample style used for future letters.</p></div></div>{template ? <DocumentSummary title={template.name} subtitle={template.sourceType.toUpperCase()} onOpen={onOpenTemplate} action="Open" /> : <EmptyState compact title="No sample format" text="Upload a sample as PDF, text, or LaTeX." action="Upload sample" onAction={onUploadTemplate} />}<button className="text-button document-upload-link" onClick={onUploadTemplate}><Icon name="upload" width="14" />Upload latest sample</button></div>
    </section>
  </div>;
}

function ApplicationsView({ data, applications, search, setSearch, onOpen, onDelete }: { data: AppData; applications: JobApplication[]; search: string; setSearch: (value: string) => void; onOpen: (item: JobApplication) => void; onDelete: (item: JobApplication) => void }) {
  return <section className="panel full-width"><div className="toolbar"><div className="search-box"><Icon name="search" width="17" /><input placeholder="Search company, role, job ID or status" value={search} onChange={(event) => setSearch(event.target.value)} /></div><span>{applications.length} roles</span></div>{applications.length ? <div className="data-table"><div className="table-head"><span>Role</span><span>Date applied</span><span>Resume</span><span>Status</span><span /></div>{applications.map((item) => <div className="table-row" key={item.id}><button className="row-main" onClick={() => onOpen(item)}><div className="avatar">{companyName(data, item.companyId).slice(0, 2).toUpperCase()}</div><div><strong>{item.roleTitle || "Role title not recorded"}</strong><span>{companyName(data, item.companyId)}{item.jobId ? ` · ${item.jobId}` : ""}</span></div></button><span>{formatDate(item.dateApplied)}</span><span>{resumeName(data, item.resumeId)}</span><span className={`status-pill ${statusMeta[item.status].className}`}>{statusMeta[item.status].label}</span><button className="icon-button danger" aria-label="Delete role" onClick={() => onDelete(item)}><Icon name="trash" width="16" /></button></div>)}</div> : <EmptyState title="No roles found" text="Add a role or clear the search." action="Clear search" onAction={() => setSearch("")} />}</section>;
}

function CompaniesView({ data, onAdd, onOpen, onAddRole, onDelete }: { data: AppData; onAdd: () => void; onOpen: (item: Company) => void; onAddRole: (id: string) => void; onDelete: (item: Company) => void }) {
  return <section className="panel full-width"><div className="panel-heading"><div><h2>Companies</h2><p>High-level company context and associated roles.</p></div><button className="primary-button" onClick={onAdd}><Icon name="plus" width="15" />Add company</button></div>{data.companies.length ? <div className="card-grid">{data.companies.map((company) => { const roles = data.applications.filter((item) => item.companyId === company.id); return <article className="company-card" key={company.id}><div className="company-card-head"><div className="avatar large">{company.name.slice(0, 2).toUpperCase()}</div><div><h3>{company.name}</h3><span>{company.industry || "Industry not recorded"}</span></div></div><p>{company.shortDescription || "No company description yet."}</p><div className="company-card-footer"><span>{roles.length} role{roles.length === 1 ? "" : "s"}</span><div><button className="text-button" onClick={() => onAddRole(company.id)}>Add role</button><button className="icon-button" onClick={() => onOpen(company)}><Icon name="edit" width="15" /></button><button className="icon-button danger" onClick={() => onDelete(company)}><Icon name="trash" width="15" /></button></div></div></article>; })}</div> : <EmptyState title="No companies" text="Create a company manually. AI can optionally help fill high-level details." action="Add company" onAction={onAdd} />}</section>;
}

function DocumentsView(props: {
  data: AppData; onUploadCurrent: () => void; onAddResume: () => void; onEditResume: (item: Resume) => void; onDeleteResume: (item: Resume) => void; onSetCurrent: (id: string) => void;
  onUploadTemplate: () => void; onAddTemplate: () => void; onEditTemplate: (item: CoverLetterTemplate) => void; onDeleteTemplate: (item: CoverLetterTemplate) => void; onSetTemplate: (id: string) => void;
  onAddLetter: () => void; onEditLetter: (item: CoverLetter) => void; onDeleteLetter: (item: CoverLetter) => void;
}) {
  const { data } = props;
  return <div className="page-stack">
    <section className="panel"><div className="panel-heading"><div><h2>Resumes</h2><p>Central text repository. One resume may be used for many roles.</p></div><div className="button-row"><button className="secondary-button" onClick={props.onUploadCurrent}><Icon name="upload" width="15" />Upload Current Resume</button><button className="primary-button" onClick={props.onAddResume}><Icon name="plus" width="15" />Add manually</button></div></div>{data.resumes.length ? <div className="document-list">{data.resumes.map((item) => <DocumentRow key={item.id} title={item.name} subtitle={`${item.sourceType.toUpperCase()} · ${item.editableText.length.toLocaleString()} characters`} current={data.settings.currentResumeId === item.id} onOpen={() => props.onEditResume(item)} onSetCurrent={() => props.onSetCurrent(item.id)} onDelete={() => props.onDeleteResume(item)} />)}</div> : <EmptyState title="No resumes" text="Upload a current resume or add text manually." action="Upload resume" onAction={props.onUploadCurrent} />}</section>
    <section className="panel"><div className="panel-heading"><div><h2>Cover letter formats</h2><p>Sample content and formatting used for new letters.</p></div><div className="button-row"><button className="secondary-button" onClick={props.onUploadTemplate}><Icon name="upload" width="15" />Upload sample</button><button className="primary-button" onClick={props.onAddTemplate}><Icon name="plus" width="15" />Add manually</button></div></div>{data.coverLetterTemplates.length ? <div className="document-list">{data.coverLetterTemplates.map((item) => <DocumentRow key={item.id} title={item.name} subtitle={item.sourceType.toUpperCase()} current={data.settings.coverLetterTemplateId === item.id} onOpen={() => props.onEditTemplate(item)} onSetCurrent={() => props.onSetTemplate(item.id)} onDelete={() => props.onDeleteTemplate(item)} />)}</div> : <EmptyState title="No cover letter format" text="Upload a sample or add text manually." action="Upload sample" onAction={props.onUploadTemplate} />}</section>
    <section className="panel"><div className="panel-heading"><div><h2>Company cover letters</h2><p>Each letter belongs to one company and can be reused across its roles.</p></div><button className="primary-button" onClick={props.onAddLetter}><Icon name="plus" width="15" />Add cover letter</button></div>{data.coverLetters.length ? <div className="document-list">{data.coverLetters.map((item) => <DocumentRow key={item.id} title={item.name} subtitle={`${companyName(data, item.companyId)}${item.roleFamily ? ` · ${item.roleFamily}` : ""}`} onOpen={() => props.onEditLetter(item)} onDelete={() => props.onDeleteLetter(item)} />)}</div> : <EmptyState title="No cover letters" text="Create or upload a cover letter from a role." action="Add cover letter" onAction={props.onAddLetter} />}</section>
  </div>;
}

function QuestionsView({ data, onAdd, onEdit, onDelete }: { data: AppData; onAdd: () => void; onEdit: (item: Question) => void; onDelete: (item: Question) => void }) {
  return <section className="panel full-width"><div className="panel-heading"><div><h2>Question repository</h2><p>Generic questions and company-specific prompts. Application answers are stored with each role.</p></div><button className="primary-button" onClick={onAdd}><Icon name="plus" width="15" />Add question</button></div>{data.questions.length ? <div className="question-list">{data.questions.map((item) => <div className="question-row" key={item.id}><div><span className="scope-tag">{item.scope === "generic" ? "Generic" : companyName(data, item.companyId)}</span><strong>{item.questionText}</strong><p>{item.reusableAnswer || "No reusable answer"}</p></div><div><button className="icon-button" onClick={() => onEdit(item)}><Icon name="edit" width="15" /></button><button className="icon-button danger" onClick={() => onDelete(item)}><Icon name="trash" width="15" /></button></div></div>)}</div> : <EmptyState title="No saved questions" text="Add generic questions or company-specific prompts." action="Add question" onAction={onAdd} />}</section>;
}

function CareerLibraryView({ data, busy, onSaveProfile, onGenerateProfile, onAdd, onEdit, onDelete }: { data: AppData; busy: boolean; onSaveProfile: (summary: string) => void; onGenerateProfile: () => void; onAdd: () => void; onEdit: (item: CareerEntry) => void; onDelete: (item: CareerEntry) => void }) {
  const [summary, setSummary] = useState(data.settings.careerProfileSummary);
  useEffect(() => setSummary(data.settings.careerProfileSummary), [data.settings.careerProfileSummary]);
  return <div className="page-stack"><section className="panel profile-panel"><div className="panel-heading"><div><h2>Career Profile Summary</h2><p>This editable summary is sent with role-specific AI requests.</p></div>{data.settings.aiEnabled && <button className="secondary-button" disabled={busy} onClick={onGenerateProfile}><Icon name="spark" width="15" />Generate from library</button>}</div><textarea rows={7} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Summarize your career experience, strengths, industries, and role positioning." /><div className="align-right"><button className="primary-button" onClick={() => onSaveProfile(summary)}>Save summary</button></div></section><section className="panel"><div className="panel-heading"><div><h2>Career entries</h2><p>Verified projects, work, achievements, skills, certifications, and stories.</p></div><button className="primary-button" onClick={onAdd}><Icon name="plus" width="15" />Add entry</button></div>{data.careerEntries.length ? <div className="career-grid">{data.careerEntries.map((item) => <article className="career-card" key={item.id}><div className="career-card-head"><span className="scope-tag">{item.category.replace("_", " ")}</span><div><button className="icon-button" onClick={() => onEdit(item)}><Icon name="edit" width="15" /></button><button className="icon-button danger" onClick={() => onDelete(item)}><Icon name="trash" width="15" /></button></div></div><h3>{item.title}</h3><span>{item.organization}</span><p>{item.entrySummary || "No entry summary yet."}</p>{item.skills && <small>{item.skills}</small>}</article>)}</div> : <EmptyState title="Career Library is empty" text="Add verified career evidence before using resume matching." action="Add entry" onAction={onAdd} />}</section></div>;
}

function SettingsView({ data, onReload, setNotice, setError }: { data: AppData; onReload: () => Promise<void>; setNotice: (value: string) => void; setError: (value: string) => void }) {
  const [draft, setDraft] = useState(data.settings);
  const [apiKey, setApiKey] = useState("");
  const [s3Access, setS3Access] = useState("");
  const [s3Secret, setS3Secret] = useState("");
  const [aiKeyStored, setAiKeyStored] = useState(false);
  const [s3KeysStored, setS3KeysStored] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => { setDraft(data.settings); }, [data.settings]);
  useEffect(() => {
    if (draft.aiProvider) hasSecret(`${draft.aiProvider}_api_key`).then(setAiKeyStored).catch(() => setAiKeyStored(false));
    Promise.all([hasSecret("s3_access_key"), hasSecret("s3_secret_key")]).then(([a,b]) => setS3KeysStored(a && b)).catch(() => setS3KeysStored(false));
  }, [draft.aiProvider]);

  async function safe(action: () => Promise<void>) {
    setWorking(true); setError("");
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setWorking(false); }
  }

  async function saveSettings() {
    await safe(async () => {
      const oldPath = data.settings.workspacePath.trim();
      const newPath = draft.workspacePath.trim();
      if (oldPath && newPath && oldPath.toLowerCase() !== newPath.toLowerCase()) {
        const migrate = window.confirm("Move copies of existing generated files and backups into the new workspace? Choose Cancel to start a fresh workspace while leaving old files where they are.");
        if (migrate) {
          const copied = await migrateWorkspace(oldPath, newPath);
          await repository.rebaseDocumentPaths(oldPath, newPath);
          setNotice(`${copied} workspace files copied and document paths updated.`);
        }
      }
      await repository.saveSettings(draft);
      await onReload();
      setNotice("Settings saved.");
    });
  }

  async function saveAiCredential() {
    await safe(async () => {
      if (!draft.aiProvider) throw new Error("Choose a provider first.");
      if (!apiKey.trim()) throw new Error("Enter an API key.");
      await saveSecret(`${draft.aiProvider}_api_key`, apiKey);
      setApiKey(""); setAiKeyStored(true); setNotice("API key stored in the operating system credential manager.");
    });
  }

  async function removeAiCredential() {
    await safe(async () => { if (!draft.aiProvider) return; await deleteSecret(`${draft.aiProvider}_api_key`); setAiKeyStored(false); setNotice("API key removed."); });
  }

  async function saveS3Credentials() {
    await safe(async () => {
      if (!s3Access.trim() || !s3Secret.trim()) throw new Error("Enter both S3 credentials.");
      await saveSecret("s3_access_key", s3Access); await saveSecret("s3_secret_key", s3Secret); setS3Access(""); setS3Secret(""); setS3KeysStored(true); setNotice("S3 credentials stored securely.");
    });
  }

  async function backup() {
    await safe(async () => { const path = await exportBackup(draft.workspacePath, JSON.stringify(data, null, 2)); setNotice(`Backup created: ${path}`); });
  }

  async function restore() {
    await safe(async () => {
      const path = await chooseBackupFile(); if (!path) return;
      if (!window.confirm("Replace all current CareerTracker data with this backup?")) return;
      const parsed = JSON.parse(await readBackup(path)) as AppData;
      await repository.replaceAll(parsed); await onReload(); setNotice("Backup restored.");
    });
  }

  return <div className="settings-grid">
    <section className="panel"><div className="panel-heading"><div><h2>Local workspace</h2><p>Generated LaTeX, PDFs, and backups are stored here.</p></div></div><div className="settings-form"><Field label="Workspace folder"><div className="path-picker"><input value={draft.workspacePath} onChange={(event) => setDraft({ ...draft, workspacePath: event.target.value })} placeholder="C:\Users\You\Documents\CareerTracker" /><button className="secondary-button" type="button" onClick={async () => { const path = await chooseFolder(); if (path) setDraft({ ...draft, workspacePath: path }); }}>Browse</button></div></Field><Field label="Tectonic executable"><input value={draft.tectonicPath} onChange={(event) => setDraft({ ...draft, tectonicPath: event.target.value })} placeholder="tectonic or full path to tectonic.exe" /></Field><div className="button-row"><button className="secondary-button" onClick={backup}>Export backup</button><button className="secondary-button" onClick={restore}>Restore backup</button></div></div></section>

    <section className="panel"><div className="panel-heading"><div><h2>AI assistance</h2><p>Optional. Keys are stored in the operating system credential manager.</p></div></div><div className="settings-form"><label className="toggle-row"><div><strong>Enable AI actions</strong><span>The tracker remains complete without AI.</span></div><input type="checkbox" checked={draft.aiEnabled} onChange={(event) => setDraft({ ...draft, aiEnabled: event.target.checked })} /></label><Field label="Provider"><select value={draft.aiProvider} onChange={(event) => setDraft({ ...draft, aiProvider: event.target.value as AiProvider })}><option value="">Not selected</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic Claude</option><option value="gemini">Google Gemini</option></select></Field><Field label="Model"><input value={draft.aiModel} onChange={(event) => setDraft({ ...draft, aiModel: event.target.value })} placeholder="Enter a model available to your account" /></Field>{draft.aiProvider && <><Field label="API key"><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={aiKeyStored ? "A key is stored. Enter a new value to replace it." : "Paste API key"} /></Field><div className="button-row"><button className="secondary-button" onClick={saveAiCredential}>Save key</button><button className="secondary-button" disabled={!aiKeyStored || !draft.aiModel} onClick={() => safe(async () => { const result = await testAi(draft.aiProvider, draft.aiModel); setNotice(`AI connection: ${result}`); })}>Test connection</button>{aiKeyStored && <button className="text-button danger-text" onClick={removeAiCredential}>Remove key</button>}</div></>}</div></section>

    <section className="panel full-span"><div className="panel-heading"><div><h2>Storage mirror</h2><p>Local storage is primary. S3-compatible storage can mirror generated files and backups.</p></div></div><div className="settings-form multi-column"><Field label="Storage mode"><select value={draft.storageProvider} onChange={(event) => setDraft({ ...draft, storageProvider: event.target.value as "local" | "s3" })}><option value="local">Local only</option><option value="s3">Local + S3-compatible mirror</option></select></Field><Field label="Bucket"><input value={draft.s3Bucket} onChange={(event) => setDraft({ ...draft, s3Bucket: event.target.value })} /></Field><Field label="Region"><input value={draft.s3Region} onChange={(event) => setDraft({ ...draft, s3Region: event.target.value })} /></Field><Field label="Prefix"><input value={draft.s3Prefix} onChange={(event) => setDraft({ ...draft, s3Prefix: event.target.value })} /></Field><Field label="Custom endpoint"><input value={draft.s3Endpoint} onChange={(event) => setDraft({ ...draft, s3Endpoint: event.target.value })} placeholder="Optional for R2, B2, MinIO" /></Field><Field label="Access key"><input type="password" value={s3Access} onChange={(event) => setS3Access(event.target.value)} placeholder={s3KeysStored ? "Stored" : "Access key"} /></Field><Field label="Secret key"><input type="password" value={s3Secret} onChange={(event) => setS3Secret(event.target.value)} placeholder={s3KeysStored ? "Stored" : "Secret key"} /></Field><div className="button-row full"><button className="secondary-button" onClick={saveS3Credentials}>Save credentials</button><button className="secondary-button" disabled={!s3KeysStored} onClick={() => safe(async () => { const result = await testS3(draft); setNotice(`S3 connection: ${result}`); })}>Test connection</button><button className="secondary-button" disabled={!s3KeysStored || !draft.workspacePath} onClick={() => safe(async () => { const count = await syncWorkspace(draft); setNotice(`${count} files uploaded.`); })}>Sync workspace now</button></div></div></section>
    <div className="settings-save full-span"><span>{aiKeyStored ? "AI key configured" : ""}</span><button className="primary-button" disabled={working} onClick={saveSettings}>Save settings</button></div>
  </div>;
}

function EvidencePreview({ data, application }: { data: AppData; application: JobApplication }) {
  const matches = scoreCareerEntries(application.jobDescription, data.careerEntries, 5);
  if (!matches.length) return <div className="gentle-note">No Career Library entry reached the local relevance threshold.</div>;
  return <div className="evidence-preview"><strong>Career evidence selected locally</strong><div>{matches.map((match) => { const entry = data.careerEntries.find((item) => item.id === match.entryId); return entry ? <span key={match.entryId}>{entry.title}<em>{match.score}% relevance</em></span> : null; })}</div></div>;
}

function RoleRow({ data, application, onClick }: { data: AppData; application: JobApplication; onClick: () => void }) {
  return <button className="role-row" onClick={onClick}><div className="avatar">{companyName(data, application.companyId).slice(0, 2).toUpperCase()}</div><div className="role-row-main"><strong>{application.roleTitle || "Role title not recorded"}</strong><span>{companyName(data, application.companyId)}{application.jobId ? ` · ${application.jobId}` : ""}</span></div><span>{resumeName(data, application.resumeId)}</span><span className={`status-pill ${statusMeta[application.status].className}`}>{statusMeta[application.status].label}</span><Icon name="arrow" width="16" /></button>;
}

function DocumentSummary({ title, subtitle, onOpen, action }: { title: string; subtitle: string; onOpen: () => void; action: string }) {
  return <div className="document-summary"><div className="document-icon"><Icon name="file" width="20" /></div><div><strong>{title}</strong><span>{subtitle}</span></div><button className="text-button" onClick={onOpen}>{action}</button></div>;
}

function DocumentRow({ title, subtitle, current = false, onOpen, onSetCurrent, onDelete }: { title: string; subtitle: string; current?: boolean; onOpen: () => void; onSetCurrent?: () => void; onDelete: () => void }) {
  return <div className="document-row"><div className="document-icon"><Icon name="file" width="19" /></div><div><strong>{title}</strong><span>{subtitle}</span></div>{current && <span className="current-badge">Current</span>}{!current && onSetCurrent && <button className="text-button" onClick={onSetCurrent}>Set current</button>}<button className="icon-button" onClick={onOpen}><Icon name="edit" width="15" /></button><button className="icon-button danger" onClick={onDelete}><Icon name="trash" width="15" /></button></div>;
}

function EmptyState({ title, text, action, onAction, compact = false }: { title: string; text: string; action: string; onAction: () => void; compact?: boolean }) {
  return <div className={`empty-state ${compact ? "compact" : ""}`}><div className="empty-icon"><Icon name="documents" width="23" /></div><h3>{title}</h3><p>{text}</p><button className="secondary-button" onClick={onAction}>{action}</button></div>;
}

function Field({ label, children, full = false, required = false, hint }: { label: string; children: ReactNode; full?: boolean; required?: boolean; hint?: string }) {
  return <label className={`field ${full ? "full" : ""}`}><span>{label}{required && <em>*</em>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function FormActions({ onCancel, extra }: { onCancel: () => void; extra?: ReactNode }) {
  return <div className="form-actions full">{extra}<span /><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button">Save</button></div>;
}
