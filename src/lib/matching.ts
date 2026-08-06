import { CareerEntry, EvidenceMatch } from "./types";

const stopWords = new Set([
  "about","after","also","and","are","been","being","but","can","company","from","have","into","job","more","must","our","role","that","the","their","this","through","using","will","with","work","years","you","your","including","required","preferred","responsibilities","experience","skills","team","candidate","position","looking","ability","strong","support","develop","management","manager",
]);

function terms(value: string): string[] {
  return (value.toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) ?? [])
    .map((term) => term.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((term) => term.length >= 3 && !stopWords.has(term));
}

function uniqueTerms(value: string): Set<string> {
  return new Set(terms(value));
}

export function topJobTerms(jobDescription: string, limit = 24): string[] {
  const counts = new Map<string, number>();
  for (const term of terms(jobDescription)) counts.set(term, (counts.get(term) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term);
}

export function scoreCareerEntries(jobDescription: string, entries: CareerEntry[], max = 5): EvidenceMatch[] {
  const jobTerms = uniqueTerms(jobDescription);
  if (!jobTerms.size) return [];

  return entries
    .map((entry) => {
      const fields: Array<[string, number]> = [
        [entry.title, 5],
        [entry.entrySummary, 4],
        [entry.skills, 5],
        [entry.technologies, 3],
        [entry.detailedDescription, 2],
        [entry.resultsMetrics, 3],
        [entry.organization, 1],
      ];
      let weightedMatches = 0;
      let possibleWeight = 0;
      const matched = new Set<string>();
      for (const [text, weight] of fields) {
        const fieldTerms = uniqueTerms(text);
        for (const term of jobTerms) {
          possibleWeight += weight;
          if (fieldTerms.has(term)) {
            weightedMatches += weight;
            matched.add(term);
          }
        }
      }
      const coverage = matched.size / jobTerms.size;
      const weighted = possibleWeight ? weightedMatches / possibleWeight : 0;
      const score = Math.min(100, Math.round((coverage * 0.65 + weighted * 0.35) * 250));
      return { entryId: entry.id, score, matchedTerms: [...matched].slice(0, 10) };
    })
    .filter((item) => item.score >= 12)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}

export function localResumeAssessment(jobDescription: string, resumeText: string, entries: CareerEntry[]): string {
  const jobTerms = topJobTerms(jobDescription, 18);
  const resume = resumeText.toLowerCase();
  const missing = jobTerms.filter((term) => !resume.includes(term)).slice(0, 8);
  const matches = scoreCareerEntries(jobDescription, entries, 5);
  const lines = [
    missing.length
      ? `Review these role terms only where your experience supports them: ${missing.join(", ")}.`
      : "The resume already contains most of the repeated terminology detected in the job description.",
  ];
  if (matches.length) lines.push(`${matches.length} Career Library entries have useful overlap with this role.`);
  else lines.push("No Career Library entry reached the relevance threshold. Add or expand relevant entries before using AI review.");
  return lines.join(" ");
}
