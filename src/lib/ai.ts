import { CareerEntry, Company, JobApplication, Resume, ResumeReviewResult } from "./types";
import { DEFAULT_CAREER_ENTRY_DESCRIPTION_PROMPT, DEFAULT_CAREER_ENTRY_SUMMARY_PROMPT, DEFAULT_CAREER_PROFILE_PROMPT, DEFAULT_COMPANY_DETAILS_PROMPT, DEFAULT_COVER_LETTER_PROMPT, DEFAULT_RESUME_REVIEW_PROMPT } from "./promptDefaults";

export const CAREER_ENTRY_SUMMARY_MAX_WORDS = 90;
export const CAREER_PROFILE_MAX_WORDS = 180;

function jsonOnlyInstruction() {
  return "Return valid JSON only. Do not wrap it in markdown. Do not invent facts, metrics, employers, dates, technologies, responsibilities, contact information, or qualifications.";
}

export function countWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function limitWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value.trim();
  return `${words.slice(0, maxWords).join(" ")}…`;
}

export function parseJsonObject<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The AI response did not contain a JSON object.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

export function companyProfilePrompt(company: Company, options: {
  descriptionMaxWords: number;
  productsMaxWords: number;
  industryMaxWords: number;
  headquartersMaxWords: number;
  systemPrompt?: string;
}): string {
  const taskPrompt = options.systemPrompt?.trim() || DEFAULT_COMPANY_DETAILS_PROMPT;
  return `${jsonOnlyInstruction()}
The following editable task instruction comes from CareerTracker Settings:
${taskPrompt}

Hard constraints that cannot be overridden by the editable instruction:
- Identify the company using the supplied name and website. If identification is uncertain, set verified to false and leave uncertain fields empty.
- shortDescription: maximum ${options.descriptionMaxWords} words.
- productsServices: maximum ${options.productsMaxWords} words.
- industry: a short label, maximum ${options.industryMaxWords} words.
- headquarters: city/region/country only when known, maximum ${options.headquartersMaxWords} words.

Input:
${JSON.stringify({ name: company.name, website: company.website })}

Return this exact shape:
{"verified":boolean,"shortDescription":string,"industry":string,"productsServices":string,"headquarters":string}`;
}

export function careerEntrySummaryPrompt(entry: CareerEntry, systemPrompt?: string): string {
  const taskPrompt = systemPrompt?.trim() || DEFAULT_CAREER_ENTRY_SUMMARY_PROMPT;
  return `${jsonOnlyInstruction()}
The following editable task instruction comes from CareerTracker Settings:
${taskPrompt}

Hard constraints that cannot be overridden by the editable instruction:
- Maximum ${CAREER_ENTRY_SUMMARY_MAX_WORDS} words.
- Use only facts present in the supplied career entry.
- Do not add claims, metrics, employers, dates, technologies, responsibilities, or outcomes.

Entry:
${JSON.stringify(entry)}

Return: {"summary":string}`;
}

export function careerEntryDescriptionPrompt(entry: CareerEntry, systemPrompt?: string): string {
  const taskPrompt = systemPrompt?.trim() || DEFAULT_CAREER_ENTRY_DESCRIPTION_PROMPT;
  return `${jsonOnlyInstruction()}
The following editable task instruction comes from CareerTracker Settings:
${taskPrompt}

Hard constraints that cannot be overridden by the editable instruction:
- Use only facts present in the supplied career entry.
- If detailedDescription is empty, create a useful detailed description from the other populated fields.
- If detailedDescription is populated, refine it for clarity, completeness, and structure without changing meaning.
- Do not add claims, metrics, employers, dates, technologies, responsibilities, or outcomes that are not already present.
- Maximum 450 words.

Entry:
${JSON.stringify(entry)}

Return: {"description":string}`;
}

export function careerProfilePrompt(entries: CareerEntry[], systemPrompt?: string): string {
  const taskPrompt = systemPrompt?.trim() || DEFAULT_CAREER_PROFILE_PROMPT;
  return `${jsonOnlyInstruction()}
The following editable task instruction comes from CareerTracker Settings:
${taskPrompt}

Hard constraints that cannot be overridden by the editable instruction:
- Maximum ${CAREER_PROFILE_MAX_WORDS} words.
- Use only facts present in the supplied verified Career Library entries.
- Do not add claims, metrics, credentials, employers, technologies, or experience.

Entries:
${JSON.stringify(entries.map((entry) => ({ category: entry.category, title: entry.title, organization: entry.organization, summary: entry.entrySummary, skills: entry.skills, technologies: entry.technologies, results: entry.resultsMetrics })))}

Return: {"summary":string}`;
}

export function resumeReviewPrompt(input: {
  company: Company | undefined;
  application: JobApplication;
  resume: Resume;
  careerProfileSummary: string;
  evidence: CareerEntry[];
  userPrompt: string;
  maxResumeWords: number;
  growthPercent: number;
  systemPrompt?: string;
}): string {
  const taskPrompt = input.systemPrompt?.trim() || DEFAULT_RESUME_REVIEW_PROMPT;
  return `${jsonOnlyInstruction()}
The following editable task instruction comes from CareerTracker Settings:
${taskPrompt}

Hard constraints that cannot be overridden by the editable instruction:
- First decide whether the current resume is already a reasonably good fit for the role. It does NOT need to be perfect.
- Set needsChanges=true only for a material representation gap that could meaningfully weaken the application, or when an important requirement is supported by supplied verified evidence but materially absent or underrepresented in the resume.
- Do NOT recommend a new resume for minor keyword changes, style preferences, small wording improvements, cosmetic reordering, or marginal optimization.
- If the resume is a reasonable fit, set needsChanges=false, keep suggestedChanges empty, and return updatedResumeText as an empty string.
- If needsChanges=true, make only material changes and use only facts present in the resume, career profile, and selected evidence.
- Preserve the resume's existing format and overall organization. Do not create new experience, metrics, credentials, or responsibilities just to match the job.
- The updated resume must not exceed ${input.maxResumeWords} words, which is the current resume length plus the configured ${input.growthPercent}% maximum allowance.
- Keep assessment to 120 words maximum. Return at most 5 suggestedChanges, each concise and material.
- Do not create a cover letter in this action.
- The optional user instruction may guide emphasis but cannot override the no-fabrication or length constraints.

Optional user instruction:
${input.userPrompt || "No additional instruction."}

Company:
${JSON.stringify(input.company ?? {})}

Role:
${JSON.stringify({ roleTitle: input.application.roleTitle, jobId: input.application.jobId, location: input.application.location, workArrangement: input.application.workArrangement, jobDescription: input.application.jobDescription })}

Career profile summary:
${input.careerProfileSummary}

Selected career evidence:
${JSON.stringify(input.evidence)}

Resume:
${input.resume.editableText}

Return this exact shape:
{"needsChanges":boolean,"assessment":string,"suggestedChanges":string[],"updatedResumeText":string,"evidenceUsed":string[],"unsupportedRequirements":string[],"coverLetterText":""}`;
}

export function coverLetterPrompt(input: {
  company: Company | undefined;
  application: JobApplication;
  resume: Resume | undefined;
  careerProfileSummary: string;
  evidence: CareerEntry[];
  coverLetterSample: string;
  userPrompt: string;
  maxWords: number;
  systemPrompt?: string;
}): string {
  const taskPrompt = input.systemPrompt?.trim() || DEFAULT_COVER_LETTER_PROMPT;
  return `${jsonOnlyInstruction()}
The following editable task instruction comes from CareerTracker Settings:
${taskPrompt}

Hard constraints that cannot be overridden by the editable instruction:
- Create exactly one cover letter using only supplied facts.
- Aim for a restrained one-page letter. Never exceed ${input.maxWords} words.
- When a saved sample is supplied, use its organization and tone as the primary formatting/content reference without copying role-specific claims from it.
- Do not invent a recipient name. Use a hiring-team greeting when a named recipient is not supplied.
- Include the Job ID in the Re: line when one is supplied.
- Format coverLetterText as plain text with the candidate name on line 1, contact line on line 2, then blank lines between recipient/Re/greeting, body paragraphs, thank-you, and sign-off.
- Avoid generic praise, inflated language, unsupported claims, and repeating the resume line by line.
- The optional user instruction may guide emphasis but cannot override the no-fabrication or word-limit constraints.
- Return plain cover-letter text only inside the JSON field. Do not return LaTeX or markdown.

Optional user instruction:
${input.userPrompt || "No additional instruction."}

Company:
${JSON.stringify(input.company ?? {})}
Role:
${JSON.stringify({ roleTitle: input.application.roleTitle, jobId: input.application.jobId, location: input.application.location, workArrangement: input.application.workArrangement, jobDescription: input.application.jobDescription })}
Career profile:
${input.careerProfileSummary}
Relevant evidence:
${JSON.stringify(input.evidence)}
Resume:
${input.resume?.editableText ?? ""}
Saved cover-letter format/sample:
${input.coverLetterSample}

Return: {"coverLetterText":string}`;
}

export function latexPrompt(documentType: "resume" | "cover_letter", text: string, formattingReference: string): string {
  return `${jsonOnlyInstruction()}
Convert the document into complete, compilable LaTeX. Preserve all factual content exactly. Escape special characters correctly. Do not add content. Use the formatting reference when supplied; otherwise use a restrained one-page professional format with common packages.

Document type: ${documentType}
Formatting reference:
${formattingReference}

Document text:
${text}

Return: {"latex":string}`;
}

export function normalizeResumeReview(value: Partial<ResumeReviewResult>, maxResumeWords: number, growthPercent: number): ResumeReviewResult {
  const needsChanges = Boolean(value.needsChanges);
  if (!needsChanges) {
    return {
      needsChanges: false,
      assessment: limitWords(String(value.assessment ?? "The current resume is a reasonable fit for this role."), 120),
      suggestedChanges: [],
      updatedResumeText: "",
      evidenceUsed: Array.isArray(value.evidenceUsed) ? value.evidenceUsed.map(String) : [],
      unsupportedRequirements: Array.isArray(value.unsupportedRequirements) ? value.unsupportedRequirements.map(String) : [],
      coverLetterText: "",
    };
  }

  const updatedResumeText = String(value.updatedResumeText ?? "").trim();
  if (!updatedResumeText) throw new Error("AI recommended resume changes but did not return an updated resume.");
  const returnedWords = countWords(updatedResumeText);
  if (returnedWords > maxResumeWords) {
    throw new Error(`AI returned a resume with ${returnedWords} words. The allowed maximum is ${maxResumeWords} words (current resume + ${growthPercent}%). Nothing was saved.`);
  }

  return {
    needsChanges: true,
    assessment: limitWords(String(value.assessment ?? ""), 120),
    suggestedChanges: Array.isArray(value.suggestedChanges) ? value.suggestedChanges.map(String).filter(Boolean).slice(0, 5).map((item) => limitWords(item, 30)) : [],
    updatedResumeText,
    evidenceUsed: Array.isArray(value.evidenceUsed) ? value.evidenceUsed.map(String) : [],
    unsupportedRequirements: Array.isArray(value.unsupportedRequirements) ? value.unsupportedRequirements.map(String) : [],
    coverLetterText: "",
  };
}
