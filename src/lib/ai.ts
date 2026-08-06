import { CareerEntry, Company, JobApplication, Resume, ResumeReviewResult } from "./types";

function jsonOnlyInstruction() {
  return "Return valid JSON only. Do not wrap it in markdown. Do not invent facts, metrics, employers, dates, technologies, or responsibilities.";
}

export function parseJsonObject<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The AI response did not contain a JSON object.");
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

export function companyProfilePrompt(company: Company): string {
  return `${jsonOnlyInstruction()}
Identify the company using the supplied name and website. If identification is uncertain, set verified to false and leave uncertain fields empty.

Input:
${JSON.stringify({ name: company.name, website: company.website })}

Return this exact shape:
{"verified":boolean,"shortDescription":string,"industry":string,"productsServices":string,"headquarters":string}`;
}

export function careerEntrySummaryPrompt(entry: CareerEntry): string {
  return `${jsonOnlyInstruction()}
Write a concise 2-4 sentence factual summary of this career entry. Preserve the user's wording and evidence. Do not add claims.

Entry:
${JSON.stringify(entry)}

Return: {"summary":string}`;
}

export function careerProfilePrompt(entries: CareerEntry[]): string {
  return `${jsonOnlyInstruction()}
Create a concise professional profile summary from these verified Career Library entries. Focus on role positioning, domains, strengths, delivery scope, and technical fluency. Do not add facts.

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
  createCoverLetter: boolean;
  coverLetterSample: string;
}): string {
  return `${jsonOnlyInstruction()}
Act as a careful resume editor. Compare the job description with the selected resume. Use only facts present in the resume, career profile, and selected evidence. Keep the suggested resume in the same general organization and writing style as the provided resume. If no change is justified, return the original resume text unchanged. ${input.createCoverLetter ? "Also create a concise cover letter grounded only in the supplied facts and aligned to the sample style when one is supplied." : "Do not create a cover letter; return an empty coverLetterText."}

Company:
${JSON.stringify(input.company ?? {})}

Role:
${JSON.stringify({ roleTitle: input.application.roleTitle, jobId: input.application.jobId, location: input.application.location, jobDescription: input.application.jobDescription })}

Career profile summary:
${input.careerProfileSummary}

Selected career evidence:
${JSON.stringify(input.evidence)}

Resume:
${input.resume.editableText}

Cover letter sample:
${input.coverLetterSample}

Return this exact shape:
{"needsChanges":boolean,"assessment":string,"suggestedChanges":string[],"updatedResumeText":string,"evidenceUsed":string[],"unsupportedRequirements":string[],"coverLetterText":string}`;
}

export function coverLetterPrompt(input: {
  company: Company | undefined;
  application: JobApplication;
  resume: Resume | undefined;
  careerProfileSummary: string;
  evidence: CareerEntry[];
  coverLetterSample: string;
}): string {
  return `${jsonOnlyInstruction()}
Create one concise cover letter for this role using only the supplied facts. Match the organization and tone of the sample when one is supplied. Avoid generic praise, inflated language, and unsupported claims.

Company:
${JSON.stringify(input.company ?? {})}
Role:
${JSON.stringify({ roleTitle: input.application.roleTitle, jobId: input.application.jobId, jobDescription: input.application.jobDescription })}
Career profile:
${input.careerProfileSummary}
Relevant evidence:
${JSON.stringify(input.evidence)}
Resume:
${input.resume?.editableText ?? ""}
Sample:
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

export function normalizeResumeReview(value: Partial<ResumeReviewResult>, fallbackResume: string): ResumeReviewResult {
  return {
    needsChanges: Boolean(value.needsChanges),
    assessment: String(value.assessment ?? ""),
    suggestedChanges: Array.isArray(value.suggestedChanges) ? value.suggestedChanges.map(String) : [],
    updatedResumeText: String(value.updatedResumeText ?? fallbackResume),
    evidenceUsed: Array.isArray(value.evidenceUsed) ? value.evidenceUsed.map(String) : [],
    unsupportedRequirements: Array.isArray(value.unsupportedRequirements) ? value.unsupportedRequirements.map(String) : [],
    coverLetterText: String(value.coverLetterText ?? ""),
  };
}
