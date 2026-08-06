use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_s3::{primitives::ByteStream, Client as S3Client};
use aws_types::region::Region;
use chrono::Utc;
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use tauri_plugin_sql::{Migration, MigrationKind};
use walkdir::WalkDir;

const SECRET_SERVICE: &str = "CareerTracker";
const ALLOWED_SECRETS: [&str; 5] = [
    "openai_api_key",
    "anthropic_api_key",
    "gemini_api_key",
    "s3_access_key",
    "s3_secret_key",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedTextDocument {
    display_name: String,
    source_type: String,
    text: String,
    content_hash: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct S3Config {
    bucket: String,
    region: String,
    prefix: String,
    endpoint: String,
}

fn validate_secret_name(name: &str) -> Result<(), String> {
    if ALLOWED_SECRETS.contains(&name) {
        Ok(())
    } else {
        Err("Unsupported secret name.".into())
    }
}

fn secret_entry(name: &str) -> Result<Entry, String> {
    validate_secret_name(name)?;
    Entry::new(SECRET_SERVICE, name).map_err(|error| format!("Could not access secure credential storage: {error}"))
}

fn get_secret_value(name: &str) -> Result<String, String> {
    secret_entry(name)?
        .get_password()
        .map_err(|_| format!("No credential is stored for {name}."))
}

fn normalize_text_for_hash(value: &str) -> String {
    value
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn hash_text(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalize_text_for_hash(value).as_bytes());
    format!("{:x}", hasher.finalize())
}

fn safe_owner_id(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-' || *character == '_')
        .collect();
    if cleaned.is_empty() { "document".into() } else { cleaned }
}

#[tauri::command]
fn hash_text_content(text: String) -> String {
    hash_text(&text)
}

#[tauri::command]
fn import_text_document(path: String) -> Result<ImportedTextDocument, String> {
    let source = PathBuf::from(path);
    if !source.is_file() {
        return Err("The selected document is not a readable file.".into());
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
    let source_type = match extension.as_str() {
        "tex" => "latex",
        "txt" | "md" => "text",
        "pdf" => "pdf",
        _ => return Err("Supported files are PDF, TXT, MD, and TEX.".into()),
    };
    let text = if extension == "pdf" {
        pdf_extract::extract_text(&source)
            .map_err(|error| format!("Could not extract text from the PDF: {error}"))?
    } else {
        fs::read_to_string(&source)
            .map_err(|error| format!("Could not read the selected document as UTF-8 text: {error}"))?
    };
    if text.trim().is_empty() {
        return Err("No readable text was found in the selected document.".into());
    }
    let display_name = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Document")
        .replace('_', " ").replace('-', " ");
    Ok(ImportedTextDocument {
        display_name,
        source_type: source_type.into(),
        content_hash: hash_text(&text),
        text,
    })
}

#[tauri::command]
fn save_secret(name: String, value: String) -> Result<(), String> {
    let entry = secret_entry(&name)?;
    if value.trim().is_empty() {
        let _ = entry.delete_credential();
        return Ok(());
    }
    entry
        .set_password(value.trim())
        .map_err(|error| format!("Could not save the credential securely: {error}"))
}

#[tauri::command]
fn has_secret(name: String) -> Result<bool, String> {
    let entry = secret_entry(&name)?;
    Ok(entry.get_password().is_ok())
}

#[tauri::command]
fn delete_secret(name: String) -> Result<(), String> {
    let entry = secret_entry(&name)?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(_) => Ok(()),
    }
}

fn extract_openai_text(value: &Value) -> Option<String> {
    value.get("output")?.as_array()?.iter().find_map(|item| {
        item.get("content")?.as_array()?.iter().find_map(|content| {
            if content.get("type")?.as_str()? == "output_text" {
                content.get("text")?.as_str().map(str::to_owned)
            } else {
                None
            }
        })
    })
}

async fn call_openai(client: &Client, model: &str, prompt: &str) -> Result<String, String> {
    let key = get_secret_value("openai_api_key")?;
    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(key)
        .json(&json!({ "model": model, "input": prompt, "store": false }))
        .send()
        .await
        .map_err(|error| format!("OpenAI request failed: {error}"))?;
    let status = response.status();
    let value: Value = response.json().await.map_err(|error| format!("OpenAI returned invalid JSON: {error}"))?;
    if !status.is_success() {
        return Err(value.get("error").and_then(|error| error.get("message")).and_then(Value::as_str).unwrap_or("OpenAI rejected the request.").to_string());
    }
    extract_openai_text(&value).ok_or_else(|| "OpenAI returned no text.".into())
}

async fn call_anthropic(client: &Client, model: &str, prompt: &str) -> Result<String, String> {
    let key = get_secret_value("anthropic_api_key")?;
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&json!({ "model": model, "max_tokens": 6000, "messages": [{ "role": "user", "content": prompt }] }))
        .send()
        .await
        .map_err(|error| format!("Anthropic request failed: {error}"))?;
    let status = response.status();
    let value: Value = response.json().await.map_err(|error| format!("Anthropic returned invalid JSON: {error}"))?;
    if !status.is_success() {
        return Err(value.get("error").and_then(|error| error.get("message")).and_then(Value::as_str).unwrap_or("Anthropic rejected the request.").to_string());
    }
    value
        .get("content")
        .and_then(Value::as_array)
        .and_then(|content| content.iter().find(|item| item.get("type").and_then(Value::as_str) == Some("text")))
        .and_then(|item| item.get("text"))
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| "Anthropic returned no text.".into())
}

async fn call_gemini(client: &Client, model: &str, prompt: &str) -> Result<String, String> {
    let key = get_secret_value("gemini_api_key")?;
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent");
    let response = client
        .post(url)
        .header("x-goog-api-key", key)
        .json(&json!({ "contents": [{ "parts": [{ "text": prompt }] }] }))
        .send()
        .await
        .map_err(|error| format!("Gemini request failed: {error}"))?;
    let status = response.status();
    let value: Value = response.json().await.map_err(|error| format!("Gemini returned invalid JSON: {error}"))?;
    if !status.is_success() {
        return Err(value.get("error").and_then(|error| error.get("message")).and_then(Value::as_str).unwrap_or("Gemini rejected the request.").to_string());
    }
    value
        .pointer("/candidates/0/content/parts/0/text")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| "Gemini returned no text.".into())
}

#[tauri::command]
async fn ai_complete(provider: String, model: String, prompt: String) -> Result<String, String> {
    if model.trim().is_empty() {
        return Err("Enter a model name in Settings.".into());
    }
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| format!("Could not initialize the HTTP client: {error}"))?;
    match provider.as_str() {
        "openai" => call_openai(&client, &model, &prompt).await,
        "anthropic" => call_anthropic(&client, &model, &prompt).await,
        "gemini" => call_gemini(&client, &model, &prompt).await,
        _ => Err("Unsupported AI provider.".into()),
    }
}

#[tauri::command]
async fn test_ai_provider(provider: String, model: String) -> Result<String, String> {
    let result = ai_complete(provider, model, "Reply with exactly: connection ok".into()).await?;
    Ok(result.trim().to_string())
}

#[tauri::command]
fn compile_latex(
    latex_text: String,
    workspace_path: String,
    owner_id: String,
    document_kind: String,
    tectonic_path: String,
) -> Result<String, String> {
    if latex_text.trim().is_empty() {
        return Err("There is no LaTeX content to compile.".into());
    }
    if workspace_path.trim().is_empty() {
        return Err("Choose a local workspace folder in Settings first.".into());
    }
    let kind = match document_kind.as_str() {
        "resume" => "resumes",
        "cover_letter" => "cover-letters",
        _ => return Err("Unsupported document type.".into()),
    };
    let stamp = Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let output_dir = PathBuf::from(workspace_path)
        .join("generated")
        .join(kind)
        .join(safe_owner_id(&owner_id));
    fs::create_dir_all(&output_dir)
        .map_err(|error| format!("Could not create the output folder: {error}"))?;
    let tex_path = output_dir.join(format!("{kind}-{stamp}.tex"));
    fs::write(&tex_path, latex_text)
        .map_err(|error| format!("Could not write the LaTeX file: {error}"))?;
    let executable = if tectonic_path.trim().is_empty() { "tectonic" } else { tectonic_path.trim() };
    let output = Command::new(executable)
        .arg("-o")
        .arg(&output_dir)
        .arg(&tex_path)
        .output()
        .map_err(|error| format!("Could not start Tectonic. Install it or set its executable path in Settings. {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("LaTeX compilation failed.\n{}\n{}", stdout.trim(), stderr.trim()));
    }
    let pdf_path = tex_path.with_extension("pdf");
    if !pdf_path.exists() {
        return Err("Tectonic completed but the expected PDF was not created.".into());
    }
    Ok(pdf_path.to_string_lossy().to_string())
}


fn copy_directory_contents(source: &Path, destination: &Path, copied: &mut usize) -> Result<(), String> {
    if !source.exists() { return Ok(()); }
    fs::create_dir_all(destination).map_err(|error| format!("Could not create {}: {error}", destination.display()))?;
    for entry in fs::read_dir(source).map_err(|error| format!("Could not read {}: {error}", source.display()))? {
        let entry = entry.map_err(|error| format!("Could not read a workspace item: {error}"))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copy_directory_contents(&source_path, &destination_path, copied)?;
        } else if source_path.is_file() {
            if let Some(parent) = destination_path.parent() { fs::create_dir_all(parent).map_err(|error| format!("Could not create {}: {error}", parent.display()))?; }
            fs::copy(&source_path, &destination_path).map_err(|error| format!("Could not copy {}: {error}", source_path.display()))?;
            *copied += 1;
        }
    }
    Ok(())
}

#[tauri::command]
fn migrate_workspace(old_path: String, new_path: String) -> Result<usize, String> {
    if old_path.trim().is_empty() || new_path.trim().is_empty() { return Err("Both workspace paths are required.".into()); }
    let old_root = PathBuf::from(old_path);
    let new_root = PathBuf::from(new_path);
    if old_root == new_root { return Ok(0); }
    if new_root.starts_with(&old_root) { return Err("Choose a destination outside the current workspace.".into()); }
    let mut copied = 0usize;
    copy_directory_contents(&old_root, &new_root, &mut copied)?;
    Ok(copied)
}

#[tauri::command]
fn write_backup(workspace_path: String, json: String) -> Result<String, String> {
    if workspace_path.trim().is_empty() {
        return Err("Choose a workspace folder before exporting a backup.".into());
    }
    let directory = PathBuf::from(workspace_path).join("backups");
    fs::create_dir_all(&directory).map_err(|error| format!("Could not create the backup folder: {error}"))?;
    let path = directory.join(format!("careertracker-backup-{}.json", Utc::now().format("%Y%m%d-%H%M%S")));
    fs::write(&path, json).map_err(|error| format!("Could not write the backup: {error}"))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("Could not read the selected file: {error}"))
}

async fn s3_client(config: &S3Config) -> Result<S3Client, String> {
    if config.bucket.trim().is_empty() {
        return Err("Enter an S3 bucket name.".into());
    }
    let access_key = get_secret_value("s3_access_key")?;
    let secret_key = get_secret_value("s3_secret_key")?;
    let credentials = Credentials::new(access_key, secret_key, None, None, "CareerTracker");
    let shared = aws_config::defaults(BehaviorVersion::latest())
        .region(Region::new(if config.region.trim().is_empty() { "us-east-1".to_string() } else { config.region.clone() }))
        .credentials_provider(credentials)
        .load()
        .await;
    let mut builder = aws_sdk_s3::config::Builder::from(&shared);
    if !config.endpoint.trim().is_empty() {
        builder = builder.endpoint_url(config.endpoint.trim()).force_path_style(true);
    }
    Ok(S3Client::from_conf(builder.build()))
}

#[tauri::command]
async fn test_s3(config: S3Config) -> Result<String, String> {
    let client = s3_client(&config).await?;
    client
        .head_bucket()
        .bucket(&config.bucket)
        .send()
        .await
        .map_err(|error| format!("Could not access the bucket: {error}"))?;
    Ok("connection ok".into())
}

fn s3_key(prefix: &str, workspace: &Path, file: &Path) -> Result<String, String> {
    let relative = file.strip_prefix(workspace).map_err(|_| "Could not determine the workspace-relative file path.".to_string())?;
    let suffix = relative.to_string_lossy().replace('\\', "/");
    let clean_prefix = prefix.trim_matches('/');
    Ok(if clean_prefix.is_empty() { suffix } else { format!("{clean_prefix}/{suffix}") })
}

#[tauri::command]
async fn sync_workspace_to_s3(workspace_path: String, config: S3Config) -> Result<usize, String> {
    let workspace = PathBuf::from(workspace_path);
    if !workspace.is_dir() {
        return Err("The configured workspace folder is unavailable.".into());
    }
    let client = s3_client(&config).await?;
    let mut uploaded = 0usize;
    for entry in WalkDir::new(&workspace).into_iter().filter_map(Result::ok).filter(|item| item.file_type().is_file()) {
        let path = entry.path();
        let key = s3_key(&config.prefix, &workspace, path)?;
        let body = ByteStream::from_path(path)
            .await
            .map_err(|error| format!("Could not read {} for upload: {error}", path.display()))?;
        client
            .put_object()
            .bucket(&config.bucket)
            .key(key)
            .body(body)
            .send()
            .await
            .map_err(|error| format!("Could not upload {}: {error}", path.display()))?;
        uploaded += 1;
    }
    Ok(uploaded)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration { version: 1, description: "create_initial_schema", sql: include_str!("../migrations/0001_initial.sql"), kind: MigrationKind::Up },
        Migration { version: 2, description: "add_document_hash", sql: include_str!("../migrations/0002_document_imports.sql"), kind: MigrationKind::Up },
        Migration { version: 3, description: "add_final_workflows", sql: include_str!("../migrations/0003_final_workflows.sql"), kind: MigrationKind::Up },
        Migration { version: 4, description: "scope_cover_letter_hash_to_company", sql: include_str!("../migrations/0004_company_scoped_cover_letter_hash.sql"), kind: MigrationKind::Up },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:careertracker.db", migrations).build())
        .invoke_handler(tauri::generate_handler![
            hash_text_content,
            import_text_document,
            save_secret,
            has_secret,
            delete_secret,
            ai_complete,
            test_ai_provider,
            compile_latex,
            migrate_workspace,
            write_backup,
            read_text_file,
            test_s3,
            sync_workspace_to_s3
        ])
        .run(tauri::generate_context!())
        .expect("error while running CareerTracker");
}
