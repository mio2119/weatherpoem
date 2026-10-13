use std::{
    fs::OpenOptions,
    io::Write,
    path::PathBuf,
    sync::OnceLock,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewWindowBuilder, WindowEvent,
};

mod foreground;

static PROCESS_STARTED: OnceLock<Instant> = OnceLock::new();
static PERFORMANCE_PROFILE: OnceLock<Option<PerformanceProfile>> = OnceLock::new();
const APP_IDENTIFIER: &str = "cn.weatherpoem.desktop";

#[derive(Clone, Debug)]
struct PerformanceProfile {
    database_path: PathBuf,
    webview_data_directory: PathBuf,
    scenario: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchContext {
    is_autostart: bool,
    foreground_presentation: foreground::ForegroundPresentation,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PerformanceProbe {
    schema_version: &'static str,
    run_id: String,
    app_version: &'static str,
    process_id: u32,
    native_ready_ms: f64,
    frontend_ready_ms: f64,
    ready_view: String,
    ready_mode: String,
    view_render_ms: f64,
    performance_scenario: Option<String>,
    recorded_at_unix_ms: u128,
}

#[tauri::command]
fn launch_context() -> LaunchContext {
    let is_autostart = std::env::args().any(|argument| argument == "--autostart");
    LaunchContext {
        is_autostart,
        foreground_presentation: if is_autostart {
            foreground::foreground_presentation()
        } else {
            foreground::ForegroundPresentation::Clear
        },
    }
}

#[tauri::command]
fn complete_graceful_exit(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_third_party_notices(app: tauri::AppHandle) -> Result<(), String> {
    let notice_path = app
        .path()
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录：{error}"))?
        .join("licenses")
        .join("THIRD_PARTY_NOTICES.md");
    if !notice_path.is_file() {
        return Err("第三方许可清单未随当前安装包提供".to_string());
    }
    tauri_plugin_opener::open_path(notice_path, None::<&str>)
        .map_err(|error| format!("无法打开第三方许可清单：{error}"))
}

fn request_graceful_exit(app: &tauri::AppHandle) {
    if app.emit("weatherpoem://exit-requested", ()).is_err() {
        app.exit(0);
        return;
    }
    let fallback_app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        fallback_app.exit(0);
    });
}

fn is_valid_probe_run_id(run_id: &str) -> bool {
    !run_id.is_empty()
        && run_id.len() <= 64
        && run_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn resolve_performance_profile() -> Result<Option<PerformanceProfile>, String> {
    let Some(profile_path) = std::env::var_os("WEATHERPOEM_PERFORMANCE_PROFILE") else {
        if std::env::var_os("WEATHERPOEM_PERFORMANCE_SCENARIO").is_some() {
            return Err("性能故障场景只能在隔离性能目录中使用".to_string());
        }
        return Ok(None);
    };
    let run_id = std::env::var("WEATHERPOEM_PERFORMANCE_RUN_ID")
        .map_err(|_| "隔离性能目录缺少运行标识".to_string())?;
    if !is_valid_probe_run_id(&run_id)
        || std::env::var_os("WEATHERPOEM_PERFORMANCE_PROBE").is_none()
    {
        return Err("隔离性能目录只能与合法探针共同使用".to_string());
    }

    let temp_root = std::env::temp_dir()
        .canonicalize()
        .map_err(|error| format!("无法解析临时目录：{error}"))?;
    let profile_root = PathBuf::from(profile_path)
        .canonicalize()
        .map_err(|error| format!("无法解析隔离性能目录：{error}"))?;
    let relative = profile_root
        .strip_prefix(&temp_root)
        .map_err(|_| "隔离性能目录必须位于系统临时目录".to_string())?;
    let top_directory = relative
        .components()
        .next()
        .and_then(|component| component.as_os_str().to_str())
        .ok_or_else(|| "隔离性能目录缺少受控顶层目录".to_string())?;
    if !top_directory.starts_with("WeatherPoem.Performance.") {
        return Err("隔离性能目录名称不合法".to_string());
    }
    let scenario = std::env::var("WEATHERPOEM_PERFORMANCE_SCENARIO")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if let Some(value) = scenario.as_deref() {
        if !matches!(
            value,
            "weather-offline" | "weather-timeout" | "official-warning"
        ) {
            return Err("性能故障场景名称不合法".to_string());
        }
    }

    let database_directory = profile_root.join("appdata").join(APP_IDENTIFIER);
    std::fs::create_dir_all(&database_directory)
        .map_err(|error| format!("无法创建隔离数据库目录：{error}"))?;
    let database_directory = database_directory
        .canonicalize()
        .map_err(|error| format!("无法解析隔离数据库目录：{error}"))?;
    if !database_directory.starts_with(&profile_root) {
        return Err("隔离数据库目录越界".to_string());
    }
    Ok(Some(PerformanceProfile {
        database_path: database_directory.join("weatherpoem.db"),
        webview_data_directory: profile_root.join("webview"),
        scenario,
    }))
}

#[tauri::command]
fn database_url() -> Result<String, String> {
    match PERFORMANCE_PROFILE.get().and_then(Option::as_ref) {
        Some(profile) => {
            let path = profile.database_path.to_string_lossy();
            let portable_path = path.strip_prefix(r"\\?\").unwrap_or(&path);
            Ok(format!("sqlite:{portable_path}"))
        }
        None => Ok("sqlite:weatherpoem.db".to_string()),
    }
}

#[tauri::command]
fn performance_scenario() -> Option<String> {
    PERFORMANCE_PROFILE
        .get()
        .and_then(Option::as_ref)
        .and_then(|profile| profile.scenario.clone())
}

#[tauri::command]
fn is_performance_profile() -> bool {
    PERFORMANCE_PROFILE.get().and_then(Option::as_ref).is_some()
}

fn is_valid_ready_pair(view: &str, mode: &str) -> bool {
    matches!(
        (view, mode),
        ("onboarding", "local-onboarding")
            | ("poem", "live-weather")
            | ("poem", "cached-weather")
            | ("poem", "offline-rules")
            | ("warning", "safety-warning")
            | ("content-correction", "content-correction")
            | ("error", "error")
    )
}

#[cfg(test)]
mod tests {
    use super::is_valid_ready_pair;

    #[test]
    fn performance_probe_accepts_only_consistent_view_and_mode_pairs() {
        assert!(is_valid_ready_pair("onboarding", "local-onboarding"));
        assert!(is_valid_ready_pair("poem", "live-weather"));
        assert!(is_valid_ready_pair("poem", "cached-weather"));
        assert!(is_valid_ready_pair("poem", "offline-rules"));
        assert!(is_valid_ready_pair("warning", "safety-warning"));
        assert!(is_valid_ready_pair(
            "content-correction",
            "content-correction"
        ));
        assert!(is_valid_ready_pair("error", "error"));
        assert!(!is_valid_ready_pair("poem", "safety-warning"));
        assert!(!is_valid_ready_pair("unknown", "offline-rules"));
    }
}

#[tauri::command]
fn report_frontend_ready(
    frontend_elapsed_ms: f64,
    ready_view: String,
    ready_mode: String,
    view_render_ms: f64,
) -> Result<(), String> {
    let Some(probe_path) = std::env::var_os("WEATHERPOEM_PERFORMANCE_PROBE") else {
        return Ok(());
    };
    let run_id = std::env::var("WEATHERPOEM_PERFORMANCE_RUN_ID")
        .map_err(|_| "性能探针缺少运行标识".to_string())?;
    if !is_valid_probe_run_id(&run_id) {
        return Err("性能探针运行标识不合法".to_string());
    }
    if !frontend_elapsed_ms.is_finite() || !(0.0..=60_000.0).contains(&frontend_elapsed_ms) {
        return Err("前端就绪时间不合法".to_string());
    }
    if !view_render_ms.is_finite()
        || !(0.0..=frontend_elapsed_ms).contains(&view_render_ms)
        || !is_valid_ready_pair(&ready_view, &ready_mode)
    {
        return Err("前端最终视图探针不合法".to_string());
    }

    let path = PathBuf::from(probe_path);
    if path.file_name().and_then(|name| name.to_str()) != Some("weatherpoem-performance-ready.json")
    {
        return Err("性能探针文件名不合法".to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "性能探针路径缺少父目录".to_string())?;
    let temp_root = std::env::temp_dir()
        .canonicalize()
        .map_err(|error| format!("无法解析临时目录：{error}"))?;
    let probe_parent = parent
        .canonicalize()
        .map_err(|error| format!("无法解析性能探针目录：{error}"))?;
    if !probe_parent.starts_with(&temp_root) {
        return Err("性能探针必须位于当前进程临时目录内".to_string());
    }
    if path.exists() {
        return Err("性能探针目标已经存在".to_string());
    }

    let native_ready_ms = PROCESS_STARTED
        .get()
        .ok_or_else(|| "缺少原生启动计时基准".to_string())?
        .elapsed()
        .as_secs_f64()
        * 1_000.0;
    let recorded_at_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("系统时间早于 Unix 纪元：{error}"))?
        .as_millis();
    let marker = PerformanceProbe {
        schema_version: "1.2",
        run_id,
        app_version: env!("CARGO_PKG_VERSION"),
        process_id: std::process::id(),
        native_ready_ms,
        frontend_ready_ms: frontend_elapsed_ms,
        ready_view,
        ready_mode,
        view_render_ms,
        performance_scenario: PERFORMANCE_PROFILE
            .get()
            .and_then(Option::as_ref)
            .and_then(|profile| profile.scenario.clone()),
        recorded_at_unix_ms,
    };
    let payload =
        serde_json::to_vec(&marker).map_err(|error| format!("性能探针序列化失败：{error}"))?;
    let temporary_path = path.with_extension("json.tmp");
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary_path)
        .map_err(|error| format!("性能探针临时文件创建失败：{error}"))?;
    file.write_all(&payload)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("性能探针写入失败：{error}"))?;
    std::fs::rename(&temporary_path, &path)
        .map_err(|error| format!("性能探针原子提交失败：{error}"))?;
    Ok(())
}

fn reveal_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn request_main_window(app: &tauri::AppHandle) {
    let _ = app.emit("weatherpoem://open-main", ());
    reveal_main_window(app);
}

fn schedule_main_window(app: &tauri::AppHandle) {
    let callback_app = app.clone();
    let _ = app.run_on_main_thread(move || {
        request_main_window(&callback_app);
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = PROCESS_STARTED.set(Instant::now());
    let performance_profile = resolve_performance_profile().expect("WeatherPoem 性能隔离目录无效");
    let _ = PERFORMANCE_PROFILE.set(performance_profile.clone());
    let mut context = tauri::generate_context!();
    if performance_profile.is_some() {
        let window = context
            .config_mut()
            .app
            .windows
            .first_mut()
            .expect("WeatherPoem 缺少主窗口配置");
        window.create = false;
    }
    let setup_performance_profile = performance_profile.clone();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            schedule_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--autostart"])
                .build(),
        )
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            complete_graceful_exit,
            database_url,
            launch_context,
            open_third_party_notices,
            performance_scenario,
            is_performance_profile,
            report_frontend_ready
        ])
        .setup(move |app| {
            if let Some(profile) = &setup_performance_profile {
                let window_config = app
                    .config()
                    .app
                    .windows
                    .first()
                    .expect("WeatherPoem 缺少主窗口配置");
                WebviewWindowBuilder::from_config(app.handle(), window_config)?
                    .data_directory(profile.webview_data_directory.clone())
                    .build()?;
            }
            let open_item = MenuItem::with_id(app, "open", "打开今日诗笺", true, None::<&str>)?;
            let settings_item = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &settings_item, &quit_item])?;

            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("WeatherPoem 今日诗笺")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => request_main_window(app),
                    "settings" => {
                        reveal_main_window(app);
                        let _ = app.emit("weatherpoem://open-settings", ());
                    }
                    "quit" => request_graceful_exit(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        request_main_window(&tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(context)
        .expect("WeatherPoem 启动失败");
}
