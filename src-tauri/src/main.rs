#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Emitter, Manager, WebviewBuilder, WebviewUrl, LogicalPosition, LogicalSize};
use tauri::webview::{PageLoadEvent, NewWindowResponse, DownloadEvent};
use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;

const STANDARD_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const BLOCKED_DOMAINS: &[&str] = &[
    "google-analytics.com", "doubleclick.net", "googlesyndication.com",
    "googleadservices.com", "facebook.net", "adnxs.com", "tracking",
    "adsystem", "telemetry", "analytics", "metrics", "pixel", "adroll",
    "taboola", "outbrain", "scorecardresearch.com", "quantserve.com",
    "amazon-adsystem.com", "casalemedia.com", "criteo.com", "yieldmo.com",
    "rubiconproject.com", "pubmatic.com", "openx.net", "adnxs.com",
    "advertising.com", "bidswitch.net", "smartadserver.com", "fastclick.net",
    "liadm.com", "tapad.com", "bluekai.com", "lotame.com", "demdex.net",
];

const ENHANCED_STEALTH_SCRIPT: &str = r#"
(function() {
    try {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

        const screenOverride = {
            width: 1920, height: 1080,
            availWidth: 1920, availHeight: 1040,
            colorDepth: 24, pixelDepth: 24
        };
        Object.defineProperty(window, 'screen', { get: () => screenOverride });

        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function() {
            const ctx = this.getContext('2d');
            if (ctx) {
                ctx.fillStyle = 'rgba(255,255,255,0.01)';
                ctx.fillRect(0,0,1,1);
            }
            return originalToDataURL.apply(this, arguments);
        };

        const blockWebRTC = () => {
            const pc = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
            if (pc) {
                window.RTCPeerConnection = function() { return {}; };
                window.webkitRTCPeerConnection = window.RTCPeerConnection;
                window.mozRTCPeerConnection = window.RTCPeerConnection;
            }
        };
        blockWebRTC();
        console.log('Sanda Stealth Active');
    } catch(e) {}
})();
"#;

#[derive(Deserialize, Serialize, Clone)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct HistoryEntry {
    url: String,
    title: String,
    timestamp: u64,
}

#[derive(Serialize, Deserialize, Clone)]
struct Settings {
    search_engine: String,
    opacity: f64,
    data_saver: bool,
    high_security: bool,
    language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            search_engine: "https://www.startpage.com/sp/search?query=".to_string(),
            opacity: 1.0,
            data_saver: false,
            high_security: true,
            language: "ar".to_string(),
        }
    }
}

fn get_storage_path(app: &AppHandle, filename: &str) -> PathBuf {
    let mut path = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    if !path.exists() { let _ = fs::create_dir_all(&path); }
    path.push(filename);
    path
}

#[tauri::command]
async fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let path = get_storage_path(&app, "settings.json");
    let content = serde_json::to_string(&settings).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_settings(app: AppHandle) -> Result<Settings, String> {
    let path = get_storage_path(&app, "settings.json");
    if !path.exists() { return Ok(Settings::default()); }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(serde_json::from_str(&content).unwrap_or_default())
}

#[tauri::command]
async fn add_history(app: AppHandle, url: String, title: String) -> Result<(), String> {
    let path = get_storage_path(&app, "history.json");
    let mut history: Vec<HistoryEntry> = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else { Vec::new() };

    history.push(HistoryEntry {
        url, title,
        timestamp: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
    });

    if history.len() > 200 { history.remove(0); }
    let content = serde_json::to_string(&history).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_history(app: AppHandle) -> Result<Vec<HistoryEntry>, String> {
    let path = get_storage_path(&app, "history.json");
    if !path.exists() { return Ok(Vec::new()); }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let history: Vec<HistoryEntry> = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(history.into_iter().rev().collect())
}

#[tauri::command]
async fn clear_history(app: AppHandle) -> Result<(), String> {
    let path = get_storage_path(&app, "history.json");
    let _ = fs::remove_file(path);
    Ok(())
}

#[tauri::command]
async fn navigate_tab(app: AppHandle, label: String, url: String, rect: Rect) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        // Ensure webview is visible and correctly sized before navigating
        let _ = webview.set_position(tauri::Position::Logical(LogicalPosition::new(rect.x, rect.y)));
        let _ = webview.set_size(tauri::Size::Logical(LogicalSize::new(rect.width, rect.height)));
        let _ = webview.set_focus();

        webview.navigate(url.parse().map_err(|e| format!("Invalid URL: {}", e))?)
            .map_err(|e| e.to_string())?;
    } else {
        let window = app.get_window("main").ok_or("Main window not found")?;
        let app_handle = app.clone();
        let app_handle_win = app.clone();
        let app_handle_dl = app.clone();
        let webview_label = label.clone();

        let settings = get_settings(app.clone()).await.unwrap_or_default();

        let mut webview_builder = WebviewBuilder::new(&label, WebviewUrl::External(url.parse().map_err(|e| format!("Invalid URL: {}", e))?))
            .auto_resize();

        if settings.high_security {
            webview_builder = webview_builder
                .user_agent(STANDARD_UA)
                .initialization_script(ENHANCED_STEALTH_SCRIPT);

            #[cfg(target_os = "windows")]
            {
                webview_builder = webview_builder.additional_browser_args(
                    "--disable-blink-features=AutomationControlled --enable-features=msTrackingPrevention"
                );
            }
        }

        webview_builder = webview_builder
            .on_navigation(move |url| {
                if settings.high_security {
                    let host = url.host_str().unwrap_or("");
                    for blocked in BLOCKED_DOMAINS {
                        if host.contains(blocked) { return false; }
                    }
                }
                true
            })
            .on_new_window(move |url, _features| {
                let _ = app_handle_win.emit("request-new-tab", url.as_str());
                NewWindowResponse::Deny
            })
            .on_page_load(move |_webview, payload| {
                if let PageLoadEvent::Finished = payload.event() {
                    let url_str = payload.url().as_str().to_string();
                    let _ = app_handle.emit("url-changed", serde_json::json!({
                        "label": webview_label,
                        "url": url_str
                    }));
                }
            })
            .on_download(move |_webview, event| {
                match event {
                    DownloadEvent::Requested { url, destination } => {
                        let filename = url.path_segments().and_then(|s| s.last()).unwrap_or("download");
                        let mut dl_path = app_handle_dl.path().download_dir().unwrap_or_else(|_| PathBuf::from("."));
                        dl_path.push(filename);
                        *destination = dl_path.clone();
                        let _ = app_handle_dl.emit("download-started", serde_json::json!({ "url": url.as_str(), "path": dl_path.to_string_lossy() }));
                        true
                    }
                    DownloadEvent::Finished { url, path, success } => {
                        let _ = app_handle_dl.emit("download-finished", serde_json::json!({ "url": url.as_str(), "path": path.map(|p| p.to_string_lossy().to_string()), "success": success }));
                        true
                    }
                    _ => true,
                }
            });

        window.add_child(webview_builder, LogicalPosition::new(rect.x, rect.y), LogicalSize::new(rect.width, rect.height)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command] async fn switch_tab(app: AppHandle, active_label: String, inactive_labels: Vec<String>, rect: Rect) -> Result<(), String> {
    for label in inactive_labels { if let Some(webview) = app.get_webview(&label) { let _ = webview.set_size(tauri::Size::Logical(LogicalSize::new(0.0, 0.0))); } }
    if let Some(webview) = app.get_webview(&active_label) {
        let _ = webview.set_position(tauri::Position::Logical(LogicalPosition::new(rect.x, rect.y)));
        let _ = webview.set_size(tauri::Size::Logical(LogicalSize::new(rect.width, rect.height)));
        let _ = webview.set_focus();
    }
    Ok(())
}

#[tauri::command] async fn close_tab(app: AppHandle, label: String) -> Result<(), String> { if let Some(webview) = app.get_webview(&label) { webview.close().map_err(|e| e.to_string())?; } Ok(()) }
#[tauri::command] async fn update_webview_rect(app: AppHandle, label: String, rect: Rect) -> Result<(), String> { if let Some(webview) = app.get_webview(&label) { let _ = webview.set_position(tauri::Position::Logical(LogicalPosition::new(rect.x, rect.y))); let _ = webview.set_size(tauri::Size::Logical(LogicalSize::new(rect.width, rect.height))); } Ok(()) }
#[tauri::command] async fn go_back(app: AppHandle, label: String) -> Result<(), String> { if let Some(webview) = app.get_webview(&label) { let _ = webview.eval("window.history.back()"); } Ok(()) }
#[tauri::command] async fn go_forward(app: AppHandle, label: String) -> Result<(), String> { if let Some(webview) = app.get_webview(&label) { let _ = webview.eval("window.history.forward()"); } Ok(()) }
#[tauri::command] async fn refresh_page(app: AppHandle, label: String) -> Result<(), String> { if let Some(webview) = app.get_webview(&label) { let _ = webview.eval("window.location.reload()"); } Ok(()) }
#[tauri::command] async fn open_downloads(app: AppHandle) -> Result<(), String> {
    let path = app.path().download_dir().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")] { std::process::Command::new("explorer").arg(path).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "macos")] { std::process::Command::new("open").arg(path).spawn().map_err(|e| e.to_string())?; }
    #[cfg(target_os = "linux")] { std::process::Command::new("xdg-open").arg(path).spawn().map_err(|e| e.to_string())?; }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let app_handle = app.handle().clone();
            window.on_window_event(move |event| { if let tauri::WindowEvent::Resized(_) = event { let _ = app_handle.emit("window-resized", ()); } });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            navigate_tab, switch_tab, close_tab, update_webview_rect,
            go_back, go_forward, refresh_page, add_history, get_history,
            clear_history, save_settings, get_settings, open_downloads
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
