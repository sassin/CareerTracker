use aws_config::{retry::RetryConfig, BehaviorVersion};
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
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex, OnceLock,
    },
};
use tauri_plugin_sql::{Migration, MigrationKind};

const SECRET_SERVICE: &str = "CareerTracker";
const MAX_NETWORK_ATTEMPTS: usize = 3;
const ALLOWED_SECRETS: [&str; 6] = [
    "openai_api_key",
    "anthropic_api_key",
    "gemini_api_key",
    "s3_access_key",
    "s3_secret_key",
    "s3_credentials",
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentSourceFile {
    name: String,
    content: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiCompletion {
    text: String,
    input_tokens: u64,
    output_tokens: u64,
    total_tokens: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedTextDocument {
    display_name: String,
    source_type: String,
    text: String,
    content_hash: String,
    source_files: Vec<DocumentSourceFile>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct S3Config {
    bucket: String,
    region: String,
    prefix: String,
    endpoint: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct S3StoredCredentials {
    access_key: String,
    secret_key: String,
}

fn diagnostics_log_dir_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(root) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(root).join("CareerTracker").join("logs");
        }
    }
    if let Ok(root) = std::env::var("HOME") {
        return PathBuf::from(root).join(".careertracker").join("logs");
    }
    std::env::temp_dir().join("CareerTracker").join("logs")
}

fn diagnostics_log_file_path() -> PathBuf {
    diagnostics_log_dir_path().join("careertracker.log")
}

fn truncate_log_value(value: &str, max_chars: usize) -> String {
    let normalized = value.replace('\n', " ").replace('\r', " ");
    let mut output: String = normalized.chars().take(max_chars).collect();
    if normalized.chars().count() > max_chars {
        output.push_str("...");
    }
    output
}

fn endpoint_host(endpoint: &str) -> String {
    if endpoint.trim().is_empty() {
        return "default".into();
    }
    reqwest::Url::parse(endpoint.trim())
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .unwrap_or_else(|| truncate_log_value(endpoint.trim(), 160))
}

fn rotate_diagnostics(path: &Path) {
    const MAX_LOG_BYTES: u64 = 1024 * 1024;
    if fs::metadata(path).map(|metadata| metadata.len()).unwrap_or(0) < MAX_LOG_BYTES {
        return;
    }
    let oldest = path.with_extension("log.3");
    let middle = path.with_extension("log.2");
    let newest = path.with_extension("log.1");
    let _ = fs::remove_file(&oldest);
    if middle.exists() { let _ = fs::rename(&middle, &oldest); }
    if newest.exists() { let _ = fs::rename(&newest, &middle); }
    if path.exists() { let _ = fs::rename(path, &newest); }
}

fn log_event(level: &str, event: &str, details: &str) {
    let dir = diagnostics_log_dir_path();
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = diagnostics_log_file_path();
    rotate_diagnostics(&path);
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let details = truncate_log_value(details, 4000);
    let _ = writeln!(
        file,
        "{} level={} event={} {}",
        Utc::now().to_rfc3339(),
        level,
        event,
        details
    );
}

fn next_error_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    let value = COUNTER.fetch_add(1, Ordering::Relaxed) % 10_000;
    format!("CT-{}-{value:04}", Utc::now().format("%Y%m%d-%H%M%S"))
}

fn logged_error(event: &str, user_message: &str, details: &str) -> String {
    let error_id = next_error_id();
    log_event("ERROR", event, &format!("error_id={error_id} {details}"));
    format!("{user_message} Error ID: {error_id}")
}

fn log_network_attempt(event: &str, attempt: usize, details: &str) {
    log_event(
        "WARN",
        event,
        &format!(
            "attempt={} max_attempts={} {}",
            attempt + 1,
            MAX_NETWORK_ATTEMPTS,
            details
        ),
    );
}

fn http_status_retryable(status: reqwest::StatusCode) -> bool {
    status == reqwest::StatusCode::TOO_MANY_REQUESTS || status.is_server_error()
}

fn s3_error_retryable(error_text: &str) -> bool {
    let value = error_text.to_ascii_lowercase();
    ![
        "accessdenied",
        "invalidaccesskeyid",
        "signaturedoesnotmatch",
        "nosuchbucket",
        "authorizationheadermalformed",
        "invalidbucketname",
        "status code: 400",
        "status code: 401",
        "status code: 403",
        "status code: 404",
        "http status: 400",
        "http status: 401",
        "http status: 403",
        "http status: 404",
    ]
    .iter()
    .any(|needle| value.contains(needle))
}

#[tauri::command]
fn diagnostics_log_dir() -> String {
    diagnostics_log_dir_path().to_string_lossy().to_string()
}

#[tauri::command]
fn read_recent_diagnostics() -> Result<String, String> {
    let path = diagnostics_log_file_path();
    if !path.exists() {
        return Ok(String::new());
    }
    let bytes = fs::read(&path).map_err(|error| format!("Could not read diagnostics: {error}"))?;
    const MAX_BYTES: usize = 64 * 1024;
    let start = bytes.len().saturating_sub(MAX_BYTES);
    Ok(String::from_utf8_lossy(&bytes[start..]).to_string())
}

#[tauri::command]
fn clear_diagnostics() -> Result<(), String> {
    let path = diagnostics_log_file_path();
    for candidate in [
        path.clone(),
        path.with_extension("log.1"),
        path.with_extension("log.2"),
        path.with_extension("log.3"),
    ] {
        if candidate.exists() {
            fs::remove_file(&candidate).map_err(|error| format!("Could not clear diagnostics: {error}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn log_client_event(level: String, event: String, details: String) {
    let safe_level = match level.to_ascii_uppercase().as_str() {
        "ERROR" => "ERROR",
        "WARN" => "WARN",
        _ => "INFO",
    };
    log_event(safe_level, &truncate_log_value(&event, 100), &details);
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
        .map_err(|error| format!("Could not read credential {name}: {error}"))
}

fn get_s3_stored_credentials() -> Result<S3StoredCredentials, String> {
    if let Ok(value) = get_secret_value("s3_credentials") {
        let parsed: S3StoredCredentials = serde_json::from_str(&value)
            .map_err(|error| format!("Stored S3 credential bundle is invalid: {error}"))?;
        if parsed.access_key.trim().is_empty() || parsed.secret_key.trim().is_empty() {
            return Err("Stored S3 credential bundle is incomplete.".into());
        }
        return Ok(parsed);
    }

    // Backward compatibility with releases that stored the pair separately.
    let access_key = get_secret_value("s3_access_key")?;
    let secret_key = get_secret_value("s3_secret_key")?;
    Ok(S3StoredCredentials { access_key, secret_key })
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
    let source_files = if extension == "pdf" {
        Vec::new()
    } else {
        vec![DocumentSourceFile {
            name: source.file_name().and_then(|value| value.to_str()).unwrap_or("document").to_string(),
            content: text.clone(),
        }]
    };
    Ok(ImportedTextDocument {
        display_name,
        source_type: source_type.into(),
        content_hash: hash_text(&text),
        text,
        source_files,
    })
}

#[tauri::command]
fn import_latex_bundle(paths: Vec<String>) -> Result<ImportedTextDocument, String> {
    if paths.is_empty() {
        return Err("No LaTeX files were selected.".into());
    }

    let mut files: Vec<(PathBuf, String)> = Vec::new();
    for raw in paths {
        let path = PathBuf::from(raw);
        if !path.is_file() {
            return Err(format!("A selected LaTeX source is not a readable file: {}", path.display()));
        }
        let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_lowercase();
        if !matches!(extension.as_str(), "tex" | "cls" | "sty" | "bib") {
            return Err(format!("Unsupported LaTeX bundle file: {}. Select TEX, CLS, STY, or BIB files.", path.display()));
        }
        let content = fs::read_to_string(&path)
            .map_err(|error| format!("Could not read {} as UTF-8 text: {error}", path.display()))?;
        files.push((path, content));
    }

    let primary_index = files.iter().position(|(path, content)| {
        path.extension().and_then(|value| value.to_str()).map(|value| value.eq_ignore_ascii_case("tex")).unwrap_or(false)
            && content.contains("\\begin{document}")
    }).or_else(|| files.iter().position(|(path, _)| path.extension().and_then(|value| value.to_str()).map(|value| value.eq_ignore_ascii_case("tex")).unwrap_or(false)))
      .ok_or_else(|| "A LaTeX bundle must include at least one .tex file.".to_string())?;

    let primary_path = files[primary_index].0.clone();
    let primary_text = files[primary_index].1.clone();
    if primary_text.trim().is_empty() {
        return Err("The primary .tex file is empty.".into());
    }
    let display_name = primary_path.file_stem().and_then(|value| value.to_str()).unwrap_or("Resume").replace('_', " ").replace('-', " ");
    let source_files = files.into_iter().map(|(path, content)| DocumentSourceFile {
        name: path.file_name().and_then(|value| value.to_str()).unwrap_or("source").to_string(),
        content,
    }).collect();

    Ok(ImportedTextDocument {
        display_name,
        source_type: "latex".into(),
        text: primary_text.clone(),
        content_hash: hash_text(&primary_text),
        source_files,
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
fn save_s3_credentials(access_key: String, secret_key: String) -> Result<(), String> {
    if access_key.trim().is_empty() || secret_key.trim().is_empty() {
        return Err("Enter both S3 credentials.".into());
    }

    let credentials = S3StoredCredentials {
        access_key: access_key.trim().to_string(),
        secret_key: secret_key.trim().to_string(),
    };
    let serialized = serde_json::to_string(&credentials)
        .map_err(|error| format!("Could not prepare S3 credentials for secure storage: {error}"))?;
    let entry = secret_entry("s3_credentials")?;
    entry.set_password(&serialized).map_err(|error| {
        logged_error(
            "storage.s3.credentials.save",
            "Could not save S3 credentials securely.",
            &format!("credential_manager_error={}", truncate_log_value(&error.to_string(), 1200)),
        )
    })?;

    // Windows Credential Manager can report NoEntry if the same credential is
    // read immediately from a different worker thread. Verification is therefore
    // deferred until the next operation that actually requires the credential.
    log_event(
        "INFO",
        "storage.s3.credentials.save",
        "credential_saved=true verification=deferred",
    );

    // Legacy entries are no longer used once the credential bundle is saved.
    for legacy in ["s3_access_key", "s3_secret_key"] {
        if let Ok(legacy_entry) = secret_entry(legacy) {
            let _ = legacy_entry.delete_credential();
        }
    }
    Ok(())
}

#[tauri::command]
fn has_s3_credentials() -> bool {
    get_s3_stored_credentials().is_ok()
}

#[tauri::command]
fn delete_s3_credentials() -> Result<(), String> {
    for name in ["s3_credentials", "s3_access_key", "s3_secret_key"] {
        if let Ok(entry) = secret_entry(name) {
            let _ = entry.delete_credential();
        }
    }
    Ok(())
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

async fn call_openai(client: &Client, model: &str, prompt: &str) -> Result<AiCompletion, String> {
    let key = get_secret_value("openai_api_key").map_err(|error| {
        logged_error("ai.openai.credentials", "OpenAI credentials are not available.", &error)
    })?;
    let event = "ai.openai.request";
    for attempt in 0..MAX_NETWORK_ATTEMPTS {
        retry_delay(attempt).await;
        let response = client
            .post("https://api.openai.com/v1/responses")
            .bearer_auth(&key)
            .json(&json!({ "model": model, "input": prompt, "store": false }))
            .send()
            .await;
        let response = match response {
            Ok(value) => value,
            Err(error) => {
                log_network_attempt(event, attempt, &format!("provider=openai model={} transport_error={}", truncate_log_value(model, 120), truncate_log_value(&error.to_string(), 800)));
                if attempt + 1 < MAX_NETWORK_ATTEMPTS {
                    continue;
                }
                return Err(logged_error(event, "OpenAI request failed after 3 attempts.", &format!("provider=openai model={} transport_error={} retry_exhausted=true", truncate_log_value(model, 120), truncate_log_value(&error.to_string(), 1200))));
            }
        };
        let status = response.status();
        let request_id = response.headers().get("x-request-id").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        let body = response.text().await.map_err(|error| logged_error(event, "OpenAI returned an unreadable response.", &format!("provider=openai model={} http_status={} request_id={} body_read_error={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), truncate_log_value(&error.to_string(), 800))))?;
        let value: Value = match serde_json::from_str(&body) {
            Ok(value) => value,
            Err(error) => {
                log_network_attempt(event, attempt, &format!("provider=openai model={} http_status={} request_id={} parse_error={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), truncate_log_value(&error.to_string(), 800)));
                if status.is_success() && attempt + 1 < MAX_NETWORK_ATTEMPTS {
                    continue;
                }
                return Err(logged_error(event, "OpenAI returned invalid JSON.", &format!("provider=openai model={} http_status={} request_id={} parse_error={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), truncate_log_value(&error.to_string(), 1200))));
            }
        };
        if !status.is_success() {
            let message = value.get("error").and_then(|error| error.get("message")).and_then(Value::as_str).unwrap_or("OpenAI rejected the request.");
            log_network_attempt(event, attempt, &format!("provider=openai model={} http_status={} request_id={} provider_message={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), truncate_log_value(message, 800)));
            if http_status_retryable(status) && attempt + 1 < MAX_NETWORK_ATTEMPTS {
                continue;
            }
            return Err(logged_error(event, message, &format!("provider=openai model={} http_status={} request_id={} retry_exhausted={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), http_status_retryable(status))));
        }
        let text = extract_openai_text(&value).ok_or_else(|| logged_error(event, "OpenAI returned no text.", &format!("provider=openai model={} http_status={} request_id={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160))))?;
        let input_tokens = value.pointer("/usage/input_tokens").and_then(Value::as_u64).unwrap_or(0);
        let output_tokens = value.pointer("/usage/output_tokens").and_then(Value::as_u64).unwrap_or(0);
        let total_tokens = value.pointer("/usage/total_tokens").and_then(Value::as_u64).unwrap_or(input_tokens + output_tokens);
        log_event("INFO", event, &format!("provider=openai model={} http_status={} request_id={} attempt={} result=success input_tokens={} output_tokens={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), attempt + 1, input_tokens, output_tokens));
        return Ok(AiCompletion { text, input_tokens, output_tokens, total_tokens });
    }
    Err(logged_error(event, "OpenAI request failed.", "provider=openai unexpected_retry_exit=true"))
}

async fn call_anthropic(client: &Client, model: &str, prompt: &str) -> Result<AiCompletion, String> {
    let key = get_secret_value("anthropic_api_key").map_err(|error| {
        logged_error("ai.anthropic.credentials", "Anthropic credentials are not available.", &error)
    })?;
    let event = "ai.anthropic.request";
    for attempt in 0..MAX_NETWORK_ATTEMPTS {
        retry_delay(attempt).await;
        let response = client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &key)
            .header("anthropic-version", "2023-06-01")
            .json(&json!({ "model": model, "max_tokens": 6000, "messages": [{ "role": "user", "content": prompt }] }))
            .send()
            .await;
        let response = match response {
            Ok(value) => value,
            Err(error) => {
                log_network_attempt(event, attempt, &format!("provider=anthropic model={} transport_error={}", truncate_log_value(model, 120), truncate_log_value(&error.to_string(), 800)));
                if attempt + 1 < MAX_NETWORK_ATTEMPTS { continue; }
                return Err(logged_error(event, "Anthropic request failed after 3 attempts.", &format!("provider=anthropic model={} transport_error={} retry_exhausted=true", truncate_log_value(model, 120), truncate_log_value(&error.to_string(), 1200))));
            }
        };
        let status = response.status();
        let request_id = response.headers().get("request-id").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        let body = response.text().await.map_err(|error| logged_error(event, "Anthropic returned an unreadable response.", &format!("provider=anthropic model={} http_status={} request_id={} body_read_error={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), truncate_log_value(&error.to_string(), 800))))?;
        let value: Value = match serde_json::from_str(&body) {
            Ok(value) => value,
            Err(error) => {
                log_network_attempt(event, attempt, &format!("provider=anthropic model={} http_status={} request_id={} parse_error={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), truncate_log_value(&error.to_string(), 800)));
                if status.is_success() && attempt + 1 < MAX_NETWORK_ATTEMPTS { continue; }
                return Err(logged_error(event, "Anthropic returned invalid JSON.", &format!("provider=anthropic model={} http_status={} request_id={} parse_error={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), truncate_log_value(&error.to_string(), 1200))));
            }
        };
        if !status.is_success() {
            let message = value.get("error").and_then(|error| error.get("message")).and_then(Value::as_str).unwrap_or("Anthropic rejected the request.");
            log_network_attempt(event, attempt, &format!("provider=anthropic model={} http_status={} request_id={} provider_message={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), truncate_log_value(message, 800)));
            if http_status_retryable(status) && attempt + 1 < MAX_NETWORK_ATTEMPTS { continue; }
            return Err(logged_error(event, message, &format!("provider=anthropic model={} http_status={} request_id={} retry_exhausted={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), http_status_retryable(status))));
        }
        let text = value
            .get("content")
            .and_then(Value::as_array)
            .and_then(|content| content.iter().find(|item| item.get("type").and_then(Value::as_str) == Some("text")))
            .and_then(|item| item.get("text"))
            .and_then(Value::as_str)
            .map(str::to_owned)
            .ok_or_else(|| logged_error(event, "Anthropic returned no text.", &format!("provider=anthropic model={} http_status={} request_id={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160))))?;
        let input_tokens = value.pointer("/usage/input_tokens").and_then(Value::as_u64).unwrap_or(0);
        let output_tokens = value.pointer("/usage/output_tokens").and_then(Value::as_u64).unwrap_or(0);
        let total_tokens = input_tokens + output_tokens;
        log_event("INFO", event, &format!("provider=anthropic model={} http_status={} request_id={} attempt={} result=success input_tokens={} output_tokens={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), attempt + 1, input_tokens, output_tokens));
        return Ok(AiCompletion { text, input_tokens, output_tokens, total_tokens });
    }
    Err(logged_error(event, "Anthropic request failed.", "provider=anthropic unexpected_retry_exit=true"))
}

async fn call_gemini(client: &Client, model: &str, prompt: &str) -> Result<AiCompletion, String> {
    let key = get_secret_value("gemini_api_key").map_err(|error| {
        logged_error("ai.gemini.credentials", "Gemini credentials are not available.", &error)
    })?;
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent");
    let event = "ai.gemini.request";
    for attempt in 0..MAX_NETWORK_ATTEMPTS {
        retry_delay(attempt).await;
        let response = client
            .post(&url)
            .header("x-goog-api-key", &key)
            .json(&json!({ "contents": [{ "parts": [{ "text": prompt }] }] }))
            .send()
            .await;
        let response = match response {
            Ok(value) => value,
            Err(error) => {
                log_network_attempt(event, attempt, &format!("provider=gemini model={} transport_error={}", truncate_log_value(model, 120), truncate_log_value(&error.to_string(), 800)));
                if attempt + 1 < MAX_NETWORK_ATTEMPTS { continue; }
                return Err(logged_error(event, "Gemini request failed after 3 attempts.", &format!("provider=gemini model={} transport_error={} retry_exhausted=true", truncate_log_value(model, 120), truncate_log_value(&error.to_string(), 1200))));
            }
        };
        let status = response.status();
        let request_id = response.headers().get("x-goog-request-id").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        let body = response.text().await.map_err(|error| logged_error(event, "Gemini returned an unreadable response.", &format!("provider=gemini model={} http_status={} request_id={} body_read_error={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), truncate_log_value(&error.to_string(), 800))))?;
        let value: Value = match serde_json::from_str(&body) {
            Ok(value) => value,
            Err(error) => {
                log_network_attempt(event, attempt, &format!("provider=gemini model={} http_status={} request_id={} parse_error={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), truncate_log_value(&error.to_string(), 800)));
                if status.is_success() && attempt + 1 < MAX_NETWORK_ATTEMPTS { continue; }
                return Err(logged_error(event, "Gemini returned invalid JSON.", &format!("provider=gemini model={} http_status={} request_id={} parse_error={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), truncate_log_value(&error.to_string(), 1200))));
            }
        };
        if !status.is_success() {
            let message = value.get("error").and_then(|error| error.get("message")).and_then(Value::as_str).unwrap_or("Gemini rejected the request.");
            log_network_attempt(event, attempt, &format!("provider=gemini model={} http_status={} request_id={} provider_message={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), truncate_log_value(message, 800)));
            if http_status_retryable(status) && attempt + 1 < MAX_NETWORK_ATTEMPTS { continue; }
            return Err(logged_error(event, message, &format!("provider=gemini model={} http_status={} request_id={} retry_exhausted={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), http_status_retryable(status))));
        }
        let text = value
            .pointer("/candidates/0/content/parts/0/text")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .ok_or_else(|| logged_error(event, "Gemini returned no text.", &format!("provider=gemini model={} http_status={} request_id={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160))))?;
        let input_tokens = value.pointer("/usageMetadata/promptTokenCount").and_then(Value::as_u64).unwrap_or(0);
        let output_tokens = value.pointer("/usageMetadata/candidatesTokenCount").and_then(Value::as_u64).unwrap_or(0);
        let total_tokens = value.pointer("/usageMetadata/totalTokenCount").and_then(Value::as_u64).unwrap_or(input_tokens + output_tokens);
        log_event("INFO", event, &format!("provider=gemini model={} http_status={} request_id={} attempt={} result=success input_tokens={} output_tokens={}", truncate_log_value(model, 120), status.as_u16(), truncate_log_value(&request_id, 160), attempt + 1, input_tokens, output_tokens));
        return Ok(AiCompletion { text, input_tokens, output_tokens, total_tokens });
    }
    Err(logged_error(event, "Gemini request failed.", "provider=gemini unexpected_retry_exit=true"))
}

#[tauri::command]
async fn ai_complete(provider: String, model: String, prompt: String) -> Result<AiCompletion, String> {
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
    Ok(result.text.trim().to_string())
}


fn normalize_pdf_text(value: &str) -> String {
    value
        .replace('\u{2018}', "'")
        .replace('\u{2019}', "'")
        .replace('\u{201c}', "\"")
        .replace('\u{201d}', "\"")
        .replace('\u{2013}', "-")
        .replace('\u{2014}', "-")
        .replace('\u{2022}', "-")
        .chars()
        .map(|ch| if ch == '\n' || ch == '\r' || ch == '\t' || (ch as u32 >= 32 && ch as u32 <= 126) { ch } else { '?' })
        .collect()
}

fn pdf_escape(value: &str) -> String {
    normalize_pdf_text(value)
        .replace('\\', "\\\\")
        .replace('(', "\\(")
        .replace(')', "\\)")
}

fn helvetica_width_units(ch: char) -> f32 {
    match ch {
        ' ' => 278.0, '!' => 278.0, '"' => 355.0, '#' | '$' => 556.0, '%' => 889.0,
        '&' => 667.0, '\'' => 191.0, '(' | ')' => 333.0, '*' => 389.0, '+' => 584.0,
        ',' | '.' | '/' | ':' | ';' => 278.0, '-' => 333.0,
        '0'..='9' => 556.0, '<' | '=' | '>' => 584.0, '?' => 556.0, '@' => 1015.0,
        'A' | 'B' | 'E' | 'K' | 'X' | 'Y' => 667.0,
        'C' | 'D' | 'H' | 'N' | 'R' | 'U' => 722.0,
        'F' | 'T' | 'Z' => 611.0, 'G' | 'O' | 'Q' => 778.0, 'I' => 278.0,
        'J' => 500.0, 'L' => 556.0, 'M' => 833.0, 'P' => 667.0, 'S' => 667.0,
        'V' => 667.0, 'W' => 944.0,
        '[' | ']' | '\\' => 278.0, '^' => 469.0, '_' => 556.0, '`' => 333.0,
        'a' | 'b' | 'd' | 'e' | 'g' | 'h' | 'n' | 'o' | 'p' | 'q' | 'u' => 556.0,
        'c' | 'k' | 's' | 'v' | 'x' | 'y' | 'z' => 500.0,
        'f' | 't' => 278.0, 'i' | 'j' | 'l' => 222.0, 'm' => 833.0,
        'r' => 333.0, 'w' => 722.0, '{' | '}' => 334.0, '|' => 260.0, '~' => 584.0,
        _ => 556.0,
    }
}

fn pdf_text_width(text: &str, size: f32) -> f32 {
    normalize_pdf_text(text).chars().map(helvetica_width_units).sum::<f32>() * size / 1000.0
}

fn wrap_pdf_text_to_width(value: &str, size: f32, max_width: f32) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in value.split_whitespace() {
        let candidate = if current.is_empty() { word.to_string() } else { format!("{} {}", current, word) };
        if !current.is_empty() && pdf_text_width(&candidate, size) > max_width {
            lines.push(current);
            current = word.to_string();
        } else {
            current = candidate;
        }
    }
    if !current.is_empty() { lines.push(current); }
    if lines.is_empty() { lines.push(String::new()); }
    lines
}

fn push_pdf_text(stream: &mut String, font: &str, size: f32, x: f32, y: f32, text: &str) {
    stream.push_str(&format!("BT /{} {:.1} Tf 1 0 0 1 {:.1} {:.1} Tm ({}) Tj ET\n", font, size, x, y, pdf_escape(text)));
}

fn push_pdf_justified_text(stream: &mut String, font: &str, size: f32, x: f32, y: f32, right: f32, text: &str) {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.len() < 2 {
        push_pdf_text(stream, font, size, x, y, text);
        return;
    }

    let available = right - x;
    let natural = pdf_text_width(text, size);
    if natural >= available {
        push_pdf_text(stream, font, size, x, y, text);
        return;
    }

    let extra_per_space_points = (available - natural) / (words.len() - 1) as f32;
    let tj_adjustment = -(extra_per_space_points / size * 1000.0);
    let mut parts = String::new();
    for (index, word) in words.iter().enumerate() {
        if index > 0 {
            parts.push_str(&format!("({}) ", pdf_escape(" ")));
            parts.push_str(&format!("{:.2} ", tj_adjustment));
        }
        parts.push_str(&format!("({}) ", pdf_escape(word)));
    }
    stream.push_str(&format!("BT /{} {:.1} Tf 1 0 0 1 {:.1} {:.1} Tm [{}] TJ ET\n", font, size, x, y, parts.trim_end()));
}

fn render_cover_letter_pages(text: &str) -> Vec<String> {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let mut raw_lines: Vec<String> = normalized.lines().map(|line| line.trim_end().to_string()).collect();
    while raw_lines.first().map(|line| line.trim().is_empty()).unwrap_or(false) { raw_lines.remove(0); }
    while raw_lines.last().map(|line| line.trim().is_empty()).unwrap_or(false) { raw_lines.pop(); }

    let header_name = raw_lines.get(0).map(|v| v.trim()).unwrap_or("");
    let header_contact = raw_lines.get(1).map(|v| v.trim()).unwrap_or("");
    let body_lines = if raw_lines.len() > 2 { &raw_lines[2..] } else { &[][..] };

    let mut paragraphs: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut first_body_item = true;
    let mut previous_was_signoff = false;
    for line in body_lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !current.trim().is_empty() {
                paragraphs.push(current.trim().to_string());
                current.clear();
            }
            continue;
        }

        let lower = trimmed.to_ascii_lowercase();
        let is_signoff = matches!(
            lower.as_str(),
            "sincerely," | "regards," | "best," | "best regards," | "kind regards," | "thank you,"
        );
        let is_structural = first_body_item
            || lower.starts_with("re:")
            || lower.starts_with("dear ")
            || lower.starts_with("to ")
            || is_signoff
            || previous_was_signoff;

        if is_structural {
            if !current.trim().is_empty() {
                paragraphs.push(current.trim().to_string());
                current.clear();
            }
            paragraphs.push(trimmed.to_string());
        } else {
            if !current.is_empty() { current.push(' '); }
            current.push_str(trimmed);
        }

        first_body_item = false;
        previous_was_signoff = is_signoff;
    }
    if !current.trim().is_empty() { paragraphs.push(current.trim().to_string()); }
    if paragraphs.is_empty() {
        paragraphs = body_lines.iter().filter(|line| !line.trim().is_empty()).map(|line| line.trim().to_string()).collect();
    }

    let mut pages = vec![String::new()];
    let mut page_index = 0usize;
    let mut y = 744.0f32;
    let left = 64.0f32;
    let right = 548.0f32;

    if !header_name.is_empty() {
        push_pdf_text(&mut pages[0], "F2", 16.5, left, y, header_name);
        y -= 20.0;
    }
    if !header_contact.is_empty() {
        push_pdf_text(&mut pages[0], "F1", 8.6, left, y, header_contact);
        y -= 16.0;
    }
    pages[0].push_str(&format!("q 0.1216 0.3059 0.4745 RG 0.7 w {:.1} {:.1} m {:.1} {:.1} l S Q\n", left, y, right, y));
    y -= 26.0;

    for (paragraph_index, paragraph) in paragraphs.iter().enumerate() {
        let lower = paragraph.to_ascii_lowercase();
        let is_re = lower.starts_with("re:");
        let is_greeting = lower.starts_with("dear ") || lower.starts_with("to ");
        let is_signoff = matches!(
            lower.as_str(),
            "sincerely," | "regards," | "best," | "best regards," | "kind regards," | "thank you,"
        );
        let font = "F1";
        let size = if paragraph_index == 0 || is_re { 9.2 } else { 10.4 };
        let wrapped = wrap_pdf_text_to_width(paragraph, size, right - left);
        let required = wrapped.len() as f32 * 14.2 + 10.0;
        if y - required < 60.0 {
            pages.push(String::new());
            page_index += 1;
            y = 744.0;
            if !header_name.is_empty() {
                push_pdf_text(&mut pages[page_index], "F2", 10.0, left, y, header_name);
                y -= 22.0;
            }
        }
        let previous_is_signoff = paragraph_index > 0 && matches!(paragraphs[paragraph_index - 1].to_ascii_lowercase().as_str(), "sincerely," | "regards," | "best," | "best regards," | "kind regards," | "thank you,");
        let structural = paragraph_index == 0 || is_re || is_greeting || is_signoff || previous_is_signoff;
        let line_count = wrapped.len();
        for (line_index, line) in wrapped.into_iter().enumerate() {
            if !structural && line_index + 1 < line_count {
                push_pdf_justified_text(&mut pages[page_index], font, size, left, y, right, &line);
            } else {
                push_pdf_text(&mut pages[page_index], font, size, left, y, &line);
            }
            y -= 14.2;
        }
        let gap = if is_signoff {
            0.0
        } else if paragraph_index == 0 {
            2.5
        } else if is_re || is_greeting {
            10.0
        } else {
            8.0
        };
        y -= gap;
    }

    pages
}

fn build_simple_pdf(page_streams: &[String]) -> Vec<u8> {
    let page_count = page_streams.len().max(1);
    let regular_font_id = 3 + page_count * 2;
    let bold_font_id = regular_font_id + 1;
    let mut objects: Vec<String> = Vec::new();
    objects.push("<< /Type /Catalog /Pages 2 0 R >>".to_string());
    let kids = (0..page_count).map(|i| format!("{} 0 R", 3 + i * 2)).collect::<Vec<_>>().join(" ");
    objects.push(format!("<< /Type /Pages /Kids [{}] /Count {} >>", kids, page_count));
    for (index, stream) in page_streams.iter().enumerate() {
        let page_id = 3 + index * 2;
        let content_id = page_id + 1;
        objects.push(format!("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 {} 0 R /F2 {} 0 R >> >> /Contents {} 0 R >>", regular_font_id, bold_font_id, content_id));
        objects.push(format!("<< /Length {} >>\nstream\n{}endstream", stream.as_bytes().len(), stream));
    }
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>".to_string());
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>".to_string());

    let mut pdf = b"%PDF-1.4\n".to_vec();
    let mut offsets = vec![0usize];
    for (index, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n{}\nendobj\n", index + 1, object).as_bytes());
    }
    let xref_offset = pdf.len();
    pdf.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    pdf.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        pdf.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes());
    }
    pdf.extend_from_slice(format!("trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n", objects.len() + 1, xref_offset).as_bytes());
    pdf
}

#[tauri::command]
fn export_cover_letter_pdf(path: String, text: String) -> Result<(), String> {
    if text.trim().is_empty() { return Err("Cover letter text is empty.".into()); }
    let destination = PathBuf::from(path.trim());
    if destination.extension().and_then(|value| value.to_str()).map(|value| value.eq_ignore_ascii_case("pdf")) != Some(true) {
        return Err("Choose a .pdf destination.".into());
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| logged_error("cover_letter.pdf_export", "Could not create the PDF folder.", &format!("error={}", error)))?;
    }
    let pages = render_cover_letter_pages(&text);
    let bytes = build_simple_pdf(&pages);
    fs::write(&destination, bytes).map_err(|error| logged_error("cover_letter.pdf_export", "Could not write the cover letter PDF.", &format!("error={}", error)))?;
    log_event("INFO", "cover_letter.pdf_export", &format!("pages={} path={}", pages.len(), truncate_log_value(&destination.to_string_lossy(), 300)));
    Ok(())
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
fn write_text_file(path: String, content: String) -> Result<(), String> {
    let destination = PathBuf::from(path);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Could not create the backup folder: {error}"))?;
    }
    fs::write(&destination, content).map_err(|error| format!("Could not write the backup: {error}"))
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("Could not read the selected file: {error}"))
}

async fn s3_client(config: &S3Config) -> Result<S3Client, String> {
    if config.bucket.trim().is_empty() {
        return Err("Enter an S3 bucket name.".into());
    }
    let credential_context = format!(
        "bucket={} endpoint_host={} region={}",
        truncate_log_value(&config.bucket, 160),
        endpoint_host(&config.endpoint),
        truncate_log_value(&config.region, 80)
    );
    let stored = get_s3_stored_credentials().map_err(|error| {
        logged_error(
            "storage.s3.credentials",
            "S3 credentials are not available.",
            &format!("{} credential_manager_error={}", credential_context, truncate_log_value(&error, 1200)),
        )
    })?;
    let credentials = Credentials::new(stored.access_key, stored.secret_key, None, None, "CareerTracker");
    let shared = aws_config::defaults(BehaviorVersion::latest())
        .region(Region::new(if config.region.trim().is_empty() { "us-east-1".to_string() } else { config.region.clone() }))
        .credentials_provider(credentials)
        .retry_config(RetryConfig::standard().with_max_attempts(1))
        .load()
        .await;
    let mut builder = aws_sdk_s3::config::Builder::from(&shared);
    if !config.endpoint.trim().is_empty() {
        builder = builder.endpoint_url(config.endpoint.trim()).force_path_style(true);
    }
    Ok(S3Client::from_conf(builder.build()))
}

fn prefixed_key(prefix: &str, suffix: &str) -> String {
    let clean_prefix = prefix.trim_matches('/');
    let clean_suffix = suffix.trim_start_matches('/');
    if clean_prefix.is_empty() { clean_suffix.to_string() } else { format!("{clean_prefix}/{clean_suffix}") }
}

fn s3_cache() -> &'static Mutex<HashMap<String, String>> {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn s3_cache_key(config: &S3Config, key: &str) -> String {
    format!("{}|{}|{}", config.endpoint, config.bucket, key)
}

async fn retry_delay(attempt: usize) {
    let millis = match attempt {
        0 => 0,
        1 => 500,
        _ => 1500,
    };
    if millis > 0 {
        tokio::time::sleep(std::time::Duration::from_millis(millis)).await;
    }
}

fn s3_context(config: &S3Config, operation: &str, key: Option<&str>) -> String {
    format!(
        "operation={} bucket={} endpoint_host={} region={} prefix={} key={}",
        operation,
        truncate_log_value(&config.bucket, 160),
        endpoint_host(&config.endpoint),
        truncate_log_value(&config.region, 80),
        truncate_log_value(&config.prefix, 200),
        truncate_log_value(key.unwrap_or(""), 400)
    )
}

#[tauri::command]
async fn test_s3(config: S3Config) -> Result<String, String> {
    let event = "storage.s3.test_connection";
    let client = s3_client(&config).await?;
    let context = s3_context(&config, "list_objects_v2", None);
    let mut last_error = String::new();
    for attempt in 0..MAX_NETWORK_ATTEMPTS {
        retry_delay(attempt).await;
        match client.list_objects_v2().bucket(&config.bucket).max_keys(1).send().await {
            Ok(_) => {
                log_event("INFO", event, &format!("{} attempt={} result=success", context, attempt + 1));
                return Ok("connection ok".into());
            }
            Err(error) => {
                last_error = error.to_string();
                log_network_attempt(event, attempt, &format!("{} error={}", context, truncate_log_value(&last_error, 1200)));
                if !s3_error_retryable(&last_error) || attempt + 1 >= MAX_NETWORK_ATTEMPTS {
                    break;
                }
            }
        }
    }
    Err(logged_error(event, "Could not access the configured S3 storage.", &format!("{} attempts={} retry_exhausted={} error={}", context, if s3_error_retryable(&last_error) { MAX_NETWORK_ATTEMPTS } else { 1 }, s3_error_retryable(&last_error), truncate_log_value(&last_error, 1800))))
}

#[tauri::command]
async fn put_s3_text_object(config: S3Config, key: String, text: String) -> Result<(), String> {
    let event = "storage.s3.put_object";
    let client = s3_client(&config).await?;
    let full_key = prefixed_key(&config.prefix, &key);
    let context = s3_context(&config, "put_object", Some(&full_key));
    let mut last_error = String::new();
    for attempt in 0..MAX_NETWORK_ATTEMPTS {
        retry_delay(attempt).await;
        match client
            .put_object()
            .bucket(&config.bucket)
            .key(&full_key)
            .body(ByteStream::from(text.clone().into_bytes()))
            .content_type("application/json; charset=utf-8")
            .send()
            .await
        {
            Ok(_) => {
                s3_cache().lock().map_err(|_| logged_error(event, "Could not update the session cache.", &format!("{} result=upload_succeeded cache=lock_failed", context)))?
                    .insert(s3_cache_key(&config, &full_key), text);
                log_event("INFO", event, &format!("{} attempt={} result=success", context, attempt + 1));
                return Ok(());
            }
            Err(error) => {
                last_error = error.to_string();
                log_network_attempt(event, attempt, &format!("{} error={}", context, truncate_log_value(&last_error, 1200)));
                if !s3_error_retryable(&last_error) || attempt + 1 >= MAX_NETWORK_ATTEMPTS { break; }
            }
        }
    }
    Err(logged_error(event, "Could not upload the object to S3.", &format!("{} retry_exhausted={} error={}", context, s3_error_retryable(&last_error), truncate_log_value(&last_error, 1800))))
}

#[tauri::command]
async fn read_s3_text_object(config: S3Config, key: String) -> Result<String, String> {
    let event = "storage.s3.get_object";
    let full_key = if key.starts_with(config.prefix.trim_matches('/')) && !config.prefix.trim_matches('/').is_empty() {
        key
    } else {
        prefixed_key(&config.prefix, &key)
    };
    let cache_key = s3_cache_key(&config, &full_key);
    if let Some(cached) = s3_cache().lock().map_err(|_| logged_error(event, "Could not read the session cache.", "cache=lock_failed"))?.get(&cache_key).cloned() {
        log_event("INFO", event, &format!("{} cache=memory result=hit", s3_context(&config, "get_object", Some(&full_key))));
        return Ok(cached);
    }

    let client = s3_client(&config).await?;
    let context = s3_context(&config, "get_object", Some(&full_key));
    let mut last_error = String::new();
    for attempt in 0..MAX_NETWORK_ATTEMPTS {
        retry_delay(attempt).await;
        match client.get_object().bucket(&config.bucket).key(&full_key).send().await {
            Ok(output) => {
                let bytes = output.body.collect().await.map_err(|error| logged_error(event, "Could not read the downloaded S3 object.", &format!("{} body_error={}", context, truncate_log_value(&error.to_string(), 1200))))?.into_bytes();
                let text = String::from_utf8(bytes.to_vec()).map_err(|_| logged_error(event, "The downloaded S3 object is not valid UTF-8 text.", &context))?;
                s3_cache().lock().map_err(|_| logged_error(event, "Could not update the session cache.", &format!("{} result=download_succeeded cache=lock_failed", context)))?.insert(cache_key, text.clone());
                log_event("INFO", event, &format!("{} attempt={} result=success", context, attempt + 1));
                return Ok(text);
            }
            Err(error) => {
                last_error = error.to_string();
                log_network_attempt(event, attempt, &format!("{} error={}", context, truncate_log_value(&last_error, 1200)));
                if !s3_error_retryable(&last_error) || attempt + 1 >= MAX_NETWORK_ATTEMPTS { break; }
            }
        }
    }
    Err(logged_error(event, "Could not download the object from S3.", &format!("{} retry_exhausted={} error={}", context, s3_error_retryable(&last_error), truncate_log_value(&last_error, 1800))))
}

#[tauri::command]
async fn delete_s3_object(config: S3Config, key: String) -> Result<(), String> {
    let event = "storage.s3.delete_object";
    let client = s3_client(&config).await?;
    let full_key = prefixed_key(&config.prefix, &key);
    let context = s3_context(&config, "delete_object", Some(&full_key));
    let mut last_error = String::new();
    for attempt in 0..MAX_NETWORK_ATTEMPTS {
        retry_delay(attempt).await;
        match client.delete_object().bucket(&config.bucket).key(&full_key).send().await {
            Ok(_) => {
                s3_cache().lock().map_err(|_| logged_error(event, "Could not update the session cache.", &format!("{} result=delete_succeeded cache=lock_failed", context)))?.remove(&s3_cache_key(&config, &full_key));
                log_event("INFO", event, &format!("{} attempt={} result=success", context, attempt + 1));
                return Ok(());
            }
            Err(error) => {
                last_error = error.to_string();
                log_network_attempt(event, attempt, &format!("{} error={}", context, truncate_log_value(&last_error, 1200)));
                if !s3_error_retryable(&last_error) || attempt + 1 >= MAX_NETWORK_ATTEMPTS { break; }
            }
        }
    }
    Err(logged_error(event, "Could not delete the S3 object.", &format!("{} retry_exhausted={} error={}", context, s3_error_retryable(&last_error), truncate_log_value(&last_error, 1800))))
}

#[tauri::command]
async fn write_s3_backup(config: S3Config, json: String) -> Result<String, String> {
    let key = format!("backups/careertracker-backup-{}.json", Utc::now().format("%Y%m%d-%H%M%S"));
    put_s3_text_object(config.clone(), key.clone(), json).await?;
    Ok(prefixed_key(&config.prefix, &key))
}

#[tauri::command]
async fn list_s3_backups(config: S3Config) -> Result<Vec<String>, String> {
    let event = "storage.s3.list_backups";
    let client = s3_client(&config).await?;
    let prefix = prefixed_key(&config.prefix, "backups/");
    let context = s3_context(&config, "list_objects_v2", Some(&prefix));
    let mut last_error = String::new();
    for attempt in 0..MAX_NETWORK_ATTEMPTS {
        retry_delay(attempt).await;
        match client.list_objects_v2().bucket(&config.bucket).prefix(&prefix).send().await {
            Ok(output) => {
                let mut keys: Vec<String> = output.contents()
                    .iter()
                    .filter_map(|item| item.key().map(str::to_owned))
                    .filter(|key| key.ends_with(".json"))
                    .collect();
                keys.sort_by(|a, b| b.cmp(a));
                log_event("INFO", event, &format!("{} attempt={} result=success count={}", context, attempt + 1, keys.len()));
                return Ok(keys);
            }
            Err(error) => {
                last_error = error.to_string();
                log_network_attempt(event, attempt, &format!("{} error={}", context, truncate_log_value(&last_error, 1200)));
                if !s3_error_retryable(&last_error) || attempt + 1 >= MAX_NETWORK_ATTEMPTS { break; }
            }
        }
    }
    Err(logged_error(event, "Could not list S3 backups.", &format!("{} retry_exhausted={} error={}", context, s3_error_retryable(&last_error), truncate_log_value(&last_error, 1800))))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration { version: 1, description: "create_initial_schema", sql: include_str!("../migrations/0001_initial.sql"), kind: MigrationKind::Up },
        Migration { version: 2, description: "add_document_hash", sql: include_str!("../migrations/0002_document_imports.sql"), kind: MigrationKind::Up },
        Migration { version: 3, description: "add_final_workflows", sql: include_str!("../migrations/0003_final_workflows.sql"), kind: MigrationKind::Up },
        Migration { version: 4, description: "scope_cover_letter_hash_to_company", sql: include_str!("../migrations/0004_company_scoped_cover_letter_hash.sql"), kind: MigrationKind::Up },
        Migration { version: 5, description: "default_s3_region_to_auto", sql: include_str!("../migrations/0005_default_s3_region.sql"), kind: MigrationKind::Up },
        Migration { version: 6, description: "add_role_ai_prompt_and_work_arrangements", sql: include_str!("../migrations/0006_role_ai_and_work_arrangements.sql"), kind: MigrationKind::Up },
        Migration { version: 7, description: "add_ai_usage_and_document_dates", sql: include_str!("../migrations/0007_ai_usage_and_document_dates.sql"), kind: MigrationKind::Up },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:careertracker.db", migrations).build())
        .invoke_handler(tauri::generate_handler![
            diagnostics_log_dir,
            read_recent_diagnostics,
            clear_diagnostics,
            log_client_event,
            hash_text_content,
            import_text_document,
            import_latex_bundle,
            save_secret,
            has_secret,
            delete_secret,
            save_s3_credentials,
            has_s3_credentials,
            delete_s3_credentials,
            ai_complete,
            test_ai_provider,
            export_cover_letter_pdf,
            compile_latex,
            migrate_workspace,
            write_text_file,
            read_text_file,
            test_s3,
            put_s3_text_object,
            read_s3_text_object,
            delete_s3_object,
            write_s3_backup,
            list_s3_backups
        ])
        .run(tauri::generate_context!())
        .expect("error while running CareerTracker");
}
