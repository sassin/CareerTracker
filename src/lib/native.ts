import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { AiProvider, AppSettings, ImportedTextDocument } from "./types";

export interface AiCompletion { text: string; inputTokens: number; outputTokens: number; totalTokens: number; }

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function chooseDocument(): Promise<string> {
  if (!isTauriRuntime()) throw new Error("File import is available in the desktop application.");
  const selected = await open({ multiple: false, directory: false, filters: [{ name: "Document", extensions: ["pdf", "txt", "tex", "md"] }] });
  return typeof selected === "string" ? selected : "";
}

export async function chooseResumeSourceFiles(): Promise<string[]> {
  if (!isTauriRuntime()) throw new Error("File import is available in the desktop application.");
  const selected = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "Resume source", extensions: ["pdf", "txt", "md", "tex", "cls", "sty", "bib"] }],
  });
  if (typeof selected === "string") return [selected];
  return Array.isArray(selected) ? selected : [];
}

export async function chooseFolder(): Promise<string> {
  if (!isTauriRuntime()) throw new Error("Folder selection is available in the desktop application.");
  const selected = await open({ multiple: false, directory: true });
  return typeof selected === "string" ? selected : "";
}

export async function chooseBackupFile(): Promise<string> {
  if (!isTauriRuntime()) throw new Error("Backup restore is available in the desktop application.");
  const selected = await open({ multiple: false, directory: false, filters: [{ name: "CareerTracker backup", extensions: ["json"] }] });
  return typeof selected === "string" ? selected : "";
}


export async function chooseCoverLetterPdfSavePath(defaultName: string): Promise<string> {
  if (!isTauriRuntime()) throw new Error("PDF export is available in the desktop application.");
  const safeName = (defaultName || "cover-letter").replace(/[<>:"/\\|?*]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const selected = await save({
    defaultPath: `${safeName || "cover-letter"}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return typeof selected === "string" ? selected : "";
}

export async function exportCoverLetterPdf(path: string, text: string): Promise<void> {
  if (!path) throw new Error("Choose where to save the PDF.");
  if (!text.trim()) throw new Error("Cover letter text is empty.");
  await invoke("export_cover_letter_pdf", { path, text });
}
export async function chooseBackupSavePath(): Promise<string> {
  if (!isTauriRuntime()) throw new Error("Backup export is available in the desktop application.");
  const selected = await save({
    defaultPath: `careertracker-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "CareerTracker backup", extensions: ["json"] }],
  });
  return typeof selected === "string" ? selected : "";
}

export async function hashTextContent(text: string): Promise<string> {
  return invoke("hash_text_content", { text });
}

export async function importTextDocument(path: string): Promise<ImportedTextDocument> {
  return invoke("import_text_document", { path });
}

export async function importResumeSource(paths: string[]): Promise<ImportedTextDocument> {
  if (!paths.length) throw new Error("No resume source was selected.");
  if (paths.length === 1 && !/\.(cls|sty|bib)$/i.test(paths[0])) return importTextDocument(paths[0]);
  return invoke("import_latex_bundle", { paths });
}

export async function saveSecret(name: string, value: string): Promise<void> {
  await invoke("save_secret", { name, value });
}

export async function hasSecret(name: string): Promise<boolean> {
  return invoke("has_secret", { name });
}

export async function deleteSecret(name: string): Promise<void> {
  await invoke("delete_secret", { name });
}

export async function saveS3CredentialPair(accessKey: string, secretKey: string): Promise<void> {
  await invoke("save_s3_credentials", { accessKey, secretKey });
}

export async function hasS3CredentialPair(): Promise<boolean> {
  return invoke("has_s3_credentials");
}

export async function deleteS3CredentialPair(): Promise<void> {
  await invoke("delete_s3_credentials");
}

export async function logClientEvent(level: "info" | "warn" | "error", event: string, details: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("log_client_event", { level, event, details });
}

export async function diagnosticsLogDir(): Promise<string> {
  if (!isTauriRuntime()) return "";
  return invoke("diagnostics_log_dir");
}

export async function readRecentDiagnostics(): Promise<string> {
  if (!isTauriRuntime()) return "";
  return invoke("read_recent_diagnostics");
}

export async function clearDiagnostics(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("clear_diagnostics");
}

export async function aiComplete(provider: AiProvider, model: string, prompt: string): Promise<AiCompletion> {
  if (!provider) throw new Error("Choose an AI provider in Settings.");
  if (!model.trim()) throw new Error("Enter a model name in Settings.");
  return invoke("ai_complete", { provider, model, prompt });
}

export async function testAi(provider: AiProvider, model: string): Promise<AiCompletion> {
  if (!provider) throw new Error("Choose an AI provider.");
  return aiComplete(provider, model, "Reply with exactly: connection ok");
}

export async function compileLatex(latexText: string, workspacePath: string, ownerId: string, documentKind: string, tectonicPath: string): Promise<string> {
  return invoke("compile_latex", { latexText, workspacePath, ownerId, documentKind, tectonicPath });
}

export async function openLocalPath(path: string): Promise<void> {
  if (!path) throw new Error("No generated file is available.");
  await openPath(path);
}

export async function migrateWorkspace(oldPath: string, newPath: string): Promise<number> {
  return invoke("migrate_workspace", { oldPath, newPath });
}

export async function writeLocalBackup(path: string, json: string): Promise<void> {
  await invoke("write_text_file", { path, content: json });
}

export async function readBackup(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}

function s3Config(settings: AppSettings) {
  return {
    bucket: settings.s3Bucket,
    region: settings.s3Region,
    prefix: settings.s3Prefix,
    endpoint: settings.s3Endpoint,
  };
}

export async function testS3(settings: AppSettings): Promise<string> {
  return invoke("test_s3", { config: s3Config(settings) });
}

export async function writeS3Backup(settings: AppSettings, json: string): Promise<string> {
  return invoke("write_s3_backup", { config: s3Config(settings), json });
}

export async function listS3Backups(settings: AppSettings): Promise<string[]> {
  return invoke("list_s3_backups", { config: s3Config(settings) });
}

export async function readS3Backup(settings: AppSettings, key: string): Promise<string> {
  return invoke("read_s3_text_object", { config: s3Config(settings), key });
}

export async function putS3TextObject(settings: AppSettings, key: string, text: string): Promise<void> {
  await invoke("put_s3_text_object", { config: s3Config(settings), key, text });
}

export async function getS3TextObject(settings: AppSettings, key: string): Promise<string> {
  return invoke("read_s3_text_object", { config: s3Config(settings), key });
}

export async function deleteS3Object(settings: AppSettings, key: string): Promise<void> {
  await invoke("delete_s3_object", { config: s3Config(settings), key });
}
