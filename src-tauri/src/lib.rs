use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs, io,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    #[serde(default)]
    sources: Vec<String>,
    #[serde(default)]
    source_names: HashMap<String, String>,
    #[serde(default)]
    known_targets: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceSummary {
    id: String,
    name: String,
    path: String,
    available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TargetSummary {
    id: String,
    name: String,
    path: String,
    available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Connection {
    id: String,
    name: String,
    path: String,
    link_path: String,
    available: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceEntry {
    id: String,
    name: String,
    path: String,
    kind: String,
    connections: Vec<Connection>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceScan {
    source: SourceSummary,
    entries: Vec<SourceEntry>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreflightItem {
    source_path: String,
    name: String,
    target_path: String,
    link_path: String,
    status: String,
    reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkResult {
    source_path: String,
    name: String,
    target_path: String,
    link_path: String,
    status: String,
    reason: Option<String>,
}

fn error_message(context: &str, error: impl std::fmt::Display) -> String {
    format!("{context}：{error}")
}

fn application_root() -> Result<PathBuf, String> {
    let executable =
        std::env::current_exe().map_err(|error| error_message("无法定位应用程序", error))?;
    executable
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "无法定位应用根目录".to_string())
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = application_root()?.join(SETTINGS_FILE);

    // 旧版本将全部应用配置保存在系统配置目录。首次启动新版本时，
    // 把完整配置复制到应用根目录，同时保留旧文件以支持版本回退。
    if !path.exists() {
        let legacy_path = app
            .path()
            .app_config_dir()
            .map_err(|error| error_message("无法定位旧版应用配置目录", error))?
            .join(SETTINGS_FILE);
        if legacy_path.is_file() {
            fs::copy(&legacy_path, &path)
                .map_err(|error| error_message("无法将旧版应用配置迁移到应用根目录", error))?;
        }
    }

    Ok(path)
}

fn load_settings(app: &AppHandle) -> Result<Settings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let contents =
        fs::read_to_string(&path).map_err(|error| error_message("无法读取应用设置", error))?;
    serde_json::from_str(&contents).map_err(|error| error_message("应用设置格式无效", error))
}

fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    let contents = serde_json::to_string_pretty(settings)
        .map_err(|error| error_message("无法序列化应用设置", error))?;
    fs::write(path, contents).map_err(|error| error_message("无法保存应用设置", error))
}

fn canonical_directory(raw_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(raw_path.trim());
    if raw_path.trim().is_empty() {
        return Err("目录路径不能为空".into());
    }
    if !path.is_dir() {
        return Err(format!("目录不存在或不可访问：{}", path.display()));
    }
    fs::canonicalize(&path).map_err(|error| error_message("无法解析目录路径", error))
}

fn display_path(path: &Path) -> String {
    let path = path.to_string_lossy();

    #[cfg(windows)]
    {
        if let Some(path) = path.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{path}");
        }
        if let Some(path) = path.strip_prefix(r"\\?\") {
            return path.to_owned();
        }
    }

    path.into_owned()
}

#[cfg(all(test, windows))]
mod tests {
    use super::{create_directory_link, delete_directory_link, display_path};
    use std::{
        fs,
        path::Path,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn display_path_removes_windows_verbatim_prefix() {
        assert_eq!(
            display_path(Path::new(r"\\?\C:\Users\LX\skills")),
            r"C:\Users\LX\skills"
        );
    }

    #[test]
    fn display_path_restores_unc_prefix() {
        assert_eq!(
            display_path(Path::new(r"\\?\UNC\server\share\skills")),
            r"\\server\share\skills"
        );
    }

    #[test]
    fn deleting_junction_removes_link_directory_but_preserves_source() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("系统时间应晚于 Unix 纪元")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "skills-soft-link-delete-test-{}-{nonce}",
            std::process::id()
        ));
        let source = root.join("source");
        let target = root.join("target");
        let link = target.join("skill");
        let marker = source.join("SKILL.md");

        fs::create_dir_all(&source).expect("应创建测试源目录");
        fs::create_dir_all(&target).expect("应创建测试目标目录");
        fs::write(&marker, "test").expect("应创建源目录测试文件");
        create_directory_link(&source, &link).expect("应创建测试 Junction");

        delete_directory_link(&link).expect("应移除测试 Junction");

        assert!(!link.exists(), "目标目录中的链接入口应被删除");
        assert!(source.is_dir(), "源目录必须保留");
        assert!(marker.is_file(), "源目录中的文件必须保留");

        fs::remove_dir_all(&root).expect("应清理测试目录");
    }
}

fn name_for_path(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("目录")
        .to_owned()
}

fn path_eq(left: &Path, right: &Path) -> bool {
    #[cfg(windows)]
    {
        display_path(left).eq_ignore_ascii_case(&display_path(right))
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

fn source_summary(path: &Path, custom_name: Option<&str>) -> SourceSummary {
    let path_text = display_path(path);
    SourceSummary {
        id: path_text.clone(),
        name: custom_name
            .filter(|name| !name.trim().is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| name_for_path(path)),
        path: path_text,
        available: path.is_dir(),
    }
}

fn target_summary(path: &Path) -> TargetSummary {
    let path_text = display_path(path);
    TargetSummary {
        id: path_text.clone(),
        name: name_for_path(path),
        path: path_text,
        available: path.is_dir(),
    }
}

#[cfg(windows)]
fn is_managed_link(path: &Path) -> io::Result<bool> {
    junction::exists(path)
}

#[cfg(not(windows))]
fn is_managed_link(path: &Path) -> io::Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(metadata.file_type().is_symlink()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

#[cfg(windows)]
fn link_target(path: &Path) -> io::Result<PathBuf> {
    junction::get_target(path)
}

#[cfg(not(windows))]
fn link_target(path: &Path) -> io::Result<PathBuf> {
    let target = fs::read_link(path)?;
    Ok(if target.is_absolute() {
        target
    } else {
        path.parent().unwrap_or_else(|| Path::new("")).join(target)
    })
}

fn link_points_to(link: &Path, source: &Path) -> bool {
    if !matches!(is_managed_link(link), Ok(true)) {
        return false;
    }
    let Ok(target) = link_target(link) else {
        return false;
    };
    let resolved_target = fs::canonicalize(target);
    let resolved_source = fs::canonicalize(source);
    match (resolved_target, resolved_source) {
        (Ok(target), Ok(source)) => path_eq(&target, &source),
        _ => false,
    }
}

#[cfg(windows)]
fn create_directory_link(source: &Path, link: &Path) -> io::Result<()> {
    junction::create(source, link)
}

#[cfg(unix)]
fn create_directory_link(source: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(source, link)
}

#[cfg(windows)]
fn delete_directory_link(link: &Path) -> io::Result<()> {
    junction::delete(link)?;
    fs::remove_dir(link)
}

#[cfg(unix)]
fn delete_directory_link(link: &Path) -> io::Result<()> {
    fs::remove_file(link)
}

fn path_exists_without_following(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

fn make_connection(target: &Path, source_entry: &Path) -> Option<Connection> {
    let name = source_entry.file_name()?;
    let link = target.join(name);
    if !link_points_to(&link, source_entry) {
        return None;
    }
    let target_text = display_path(target);
    Some(Connection {
        id: display_path(&link),
        name: name_for_path(target),
        path: target_text,
        link_path: display_path(&link),
        available: target.is_dir(),
    })
}

#[tauri::command]
fn list_sources(app: AppHandle) -> Result<Vec<SourceSummary>, String> {
    let settings = load_settings(&app)?;
    Ok(settings
        .sources
        .iter()
        .map(PathBuf::from)
        .filter(|path| path.is_dir())
        .map(|path| {
            let path_text = display_path(&path);
            source_summary(
                &path,
                settings.source_names.get(&path_text).map(String::as_str),
            )
        })
        .collect())
}

#[tauri::command]
fn add_source(app: AppHandle, path: String) -> Result<SourceSummary, String> {
    let path = canonical_directory(&path)?;
    let mut settings = load_settings(&app)?;
    if !settings
        .sources
        .iter()
        .map(PathBuf::from)
        .any(|existing| path_eq(&existing, &path))
    {
        settings.sources.push(display_path(&path));
        save_settings(&app, &settings)?;
    }
    let path_text = display_path(&path);
    Ok(source_summary(
        &path,
        settings.source_names.get(&path_text).map(String::as_str),
    ))
}

#[tauri::command]
fn rename_source(app: AppHandle, path: String, name: String) -> Result<SourceSummary, String> {
    let path = canonical_directory(&path)?;
    let name = name.trim();
    if name.is_empty() {
        return Err("源目录名称不能为空".into());
    }
    if name.chars().count() > 80 {
        return Err("源目录名称不能超过 80 个字符".into());
    }
    if name.chars().any(char::is_control) {
        return Err("源目录名称不能包含控制字符".into());
    }

    let mut settings = load_settings(&app)?;
    let path_text = display_path(&path);
    if !settings
        .sources
        .iter()
        .map(PathBuf::from)
        .any(|existing| path_eq(&existing, &path))
    {
        return Err("该源目录尚未登记".into());
    }
    settings.source_names.insert(path_text, name.to_owned());
    save_settings(&app, &settings)?;
    Ok(source_summary(&path, Some(name)))
}

#[tauri::command]
fn remove_source(app: AppHandle, path: String) -> Result<(), String> {
    let requested = PathBuf::from(path);
    let mut settings = load_settings(&app)?;
    settings
        .sources
        .retain(|existing| !path_eq(&PathBuf::from(existing), &requested));
    settings
        .source_names
        .retain(|existing, _| !path_eq(&PathBuf::from(existing), &requested));
    save_settings(&app, &settings)
}

#[tauri::command]
fn scan_source(app: AppHandle, path: String) -> Result<SourceScan, String> {
    let source_path = canonical_directory(&path)?;
    let settings = load_settings(&app)?;
    let known_targets: Vec<PathBuf> = settings.known_targets.iter().map(PathBuf::from).collect();

    let directory =
        fs::read_dir(&source_path).map_err(|error| error_message("无法读取源目录", error))?;
    let mut entries = Vec::new();

    for item in directory {
        let item = item.map_err(|error| error_message("无法读取源条目", error))?;
        let item_path = item.path();
        let metadata = item
            .metadata()
            .map_err(|error| error_message("无法读取源条目信息", error))?;
        let is_directory = metadata.is_dir();
        let connections = if is_directory {
            known_targets
                .iter()
                .filter_map(|target| make_connection(target, &item_path))
                .collect()
        } else {
            Vec::new()
        };
        let item_path_text = display_path(&item_path);
        entries.push(SourceEntry {
            id: item_path_text.clone(),
            name: item.file_name().to_string_lossy().into_owned(),
            path: item_path_text,
            kind: if is_directory { "directory" } else { "file" }.into(),
            connections,
        });
    }

    entries.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.name.cmp(&right.name))
    });

    Ok(SourceScan {
        source: source_summary(
            &source_path,
            settings
                .source_names
                .get(&display_path(&source_path))
                .map(String::as_str),
        ),
        entries,
    })
}

#[tauri::command]
fn list_targets(app: AppHandle) -> Result<Vec<TargetSummary>, String> {
    let settings = load_settings(&app)?;
    Ok(settings
        .known_targets
        .iter()
        .map(PathBuf::from)
        .map(|path| target_summary(&path))
        .collect())
}

#[tauri::command]
fn add_target(app: AppHandle, path: String) -> Result<TargetSummary, String> {
    let path = canonical_directory(&path)?;
    let mut settings = load_settings(&app)?;
    if !settings
        .known_targets
        .iter()
        .map(PathBuf::from)
        .any(|existing| path_eq(&existing, &path))
    {
        settings.known_targets.insert(0, display_path(&path));
        save_settings(&app, &settings)?;
    }
    Ok(target_summary(&path))
}

#[tauri::command]
fn forget_target(app: AppHandle, path: String) -> Result<(), String> {
    let requested = PathBuf::from(path);
    let mut settings = load_settings(&app)?;
    settings
        .known_targets
        .retain(|existing| !path_eq(&PathBuf::from(existing), &requested));
    save_settings(&app, &settings)
}

fn preflight_item(source: &Path, target: &Path) -> Result<PreflightItem, String> {
    if !source.is_dir() {
        return Err(format!("源子目录不存在或不可访问：{}", source.display()));
    }
    let name = source
        .file_name()
        .ok_or_else(|| "无法确定源子目录名称".to_string())?;
    let link = target.join(name);
    let (status, reason) = if !path_exists_without_following(&link) {
        ("create", None)
    } else if link_points_to(&link, source) {
        ("connected", None)
    } else {
        (
            "conflict",
            Some("目标目录中已有同名文件、普通目录或指向其他位置的链接".into()),
        )
    };
    Ok(PreflightItem {
        source_path: display_path(source),
        name: name.to_string_lossy().into_owned(),
        target_path: display_path(target),
        link_path: display_path(&link),
        status: status.into(),
        reason,
    })
}

#[tauri::command]
fn preflight_links(
    source_paths: Vec<String>,
    target_path: String,
) -> Result<Vec<PreflightItem>, String> {
    let target = canonical_directory(&target_path)?;
    source_paths
        .iter()
        .map(PathBuf::from)
        .map(|source| preflight_item(&source, &target))
        .collect()
}

#[tauri::command]
fn create_links(
    app: AppHandle,
    source_paths: Vec<String>,
    target_path: String,
) -> Result<Vec<LinkResult>, String> {
    let target = canonical_directory(&target_path)?;
    let target_text = display_path(&target);

    let mut settings = load_settings(&app)?;
    if !settings
        .known_targets
        .iter()
        .map(PathBuf::from)
        .any(|existing| path_eq(&existing, &target))
    {
        settings.known_targets.insert(0, target_text.clone());
        save_settings(&app, &settings)?;
    }

    let mut results = Vec::with_capacity(source_paths.len());
    for source_text in source_paths {
        let source = PathBuf::from(&source_text);
        match preflight_item(&source, &target) {
            Ok(item) if item.status == "create" => {
                let (status, reason) =
                    match create_directory_link(&source, Path::new(&item.link_path)) {
                        Ok(()) => ("success".into(), None),
                        Err(error) => ("failed".into(), Some(error.to_string())),
                    };
                results.push(LinkResult {
                    source_path: item.source_path,
                    name: item.name,
                    target_path: item.target_path,
                    link_path: item.link_path,
                    status,
                    reason,
                });
            }
            Ok(item) => results.push(LinkResult {
                source_path: item.source_path,
                name: item.name,
                target_path: item.target_path,
                link_path: item.link_path,
                status: item.status,
                reason: item.reason,
            }),
            Err(reason) => results.push(LinkResult {
                source_path: source_text.clone(),
                name: name_for_path(&source),
                target_path: target_text.clone(),
                link_path: display_path(&target.join(name_for_path(&source))),
                status: "failed".into(),
                reason: Some(reason),
            }),
        }
    }
    Ok(results)
}

#[tauri::command]
fn remove_link(app: AppHandle, link_path: String) -> Result<(), String> {
    let link = PathBuf::from(link_path);
    let parent = link.parent().ok_or_else(|| "软链接路径无效".to_string())?;
    let settings = load_settings(&app)?;
    let is_known_target = settings
        .known_targets
        .iter()
        .map(PathBuf::from)
        .any(|target| path_eq(&target, parent));
    if !is_known_target {
        return Err("该软链接不位于已知目标目录中，已拒绝操作".into());
    }
    if !is_managed_link(&link).map_err(|error| error_message("无法检查软链接", error))? {
        return Err("目标不是由本应用管理的目录软链接，已拒绝操作".into());
    }
    delete_directory_link(&link).map_err(|error| error_message("无法移除软链接", error))
}

#[tauri::command]
fn open_directory(path: String) -> Result<(), String> {
    let directory = canonical_directory(&path)?;

    #[cfg(windows)]
    let result = Command::new("explorer.exe").arg(&directory).spawn();

    #[cfg(target_os = "macos")]
    let result = Command::new("open").arg(&directory).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = Command::new("xdg-open").arg(&directory).spawn();

    result
        .map(|_| ())
        .map_err(|error| error_message("无法在文件管理器中打开目标目录", error))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_sources,
            add_source,
            rename_source,
            remove_source,
            scan_source,
            list_targets,
            add_target,
            forget_target,
            preflight_links,
            create_links,
            remove_link,
            open_directory,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Skills 软链接应用失败");
}
