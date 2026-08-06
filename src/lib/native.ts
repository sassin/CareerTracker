import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { AiProvider, AppSettings, ImportedTextDocument } from "./types";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function chooseDocument(): Promise<string> {
  if (!isTauriRuntime()) throw new Error("File import is available in the desktop application.");
  const selected = await open({ multiple: false, directory: false, filters: [{ name: "Resume or letter", extensions: ["pdf", "txt", "tex", "md"] }] });
  return typeof selected === "string" ? selected : "";
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

export async function hashTextContent(text: string): Promise<string> {
  return invoke("hash_text_content", { text });
}

export async function importTextDocument(path: string): Promise<ImportedTextDocument> {
  return invoke("import_text_document", { path });
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

export async function aiComplete(provider: AiProvider, model: string, prompt: string): Promise<string> {
  if (!provider) throw new Error("Choose an AI provider in Settings.");
  if (!model.trim()) throw new Error("Enter a model name in Settings.");
  return invoke("ai_complete", { provider, model, prompt });
}

export async function testAi(provider: AiProvider, model: string): Promise<string> {
  if (!provider) throw new Error("Choose an AI provider.");
  return invoke("test_ai_provider", { provider, model });
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

export async function exportBackup(workspacePath: string, json: string): Promise<string> {
  return invoke("write_backup", { workspacePath, json });
}

export async function readBackup(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}

export async function testS3(settings: AppSettings): Promise<string> {
  return invoke("test_s3", { config: {
    bucket: settings.s3Bucket,
    region: settings.s3Region,
    prefix: settings.s3Prefix,
    endpoint: settings.s3Endpoint,
  } });
}

export async function syncWorkspace(settings: AppSettings): Promise<number> {
  return invoke("sync_workspace_to_s3", { workspacePath: settings.workspacePath, config: {
    bucket: settings.s3Bucket,
    region: settings.s3Region,
    prefix: settings.s3Prefix,
    endpoint: settings.s3Endpoint,
  } });
}
