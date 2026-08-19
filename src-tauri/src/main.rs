#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Emitter, Manager, WebviewBuilder, WebviewUrl, LogicalPosition, LogicalSize};
use tauri::webview::PageLoadEvent;
use serde::{Serialize, Deserialize};
use std::fs;
use std::path::PathBuf;

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
struct Bookmark {
    url: String,
    title: String,
}

fn get_storage_path(app: &AppHandle, filename: &str) -> PathBuf {
    let mut path = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path.push(filename);
    path
}

#[tauri::command]
async fn add_history(app: AppHandle, url: String, title: String) -> Result<(), String> {
    let path = get_storage_path(&app, "history.json");
    let mut history: Vec<HistoryEntry> = if path.exists() {
        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    history.push(HistoryEntry {
        url,
        title,
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
    });

    // Keep only last 100 entries
    if history.len() > 100 {
        history.remove(0);
    }

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
    Ok(history.into_iter().rev().collect()) // Newest first
}

#[tauri::command]
async fn navigate_tab(app: AppHandle, label: String, url: String, rect: Rect) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview.navigate(url.parse().map_err(|e| format!("Invalid URL: {}", e))?)
            .map_err(|e| e.to_string())?;
    } else {
        let window = app.get_window("main").ok_or("Main window not found")?;
        let app_handle = app.clone();
        let webview_label = label.clone();

        let webview_builder = WebviewBuilder::new(&label, WebviewUrl::External(url.parse().map_err(|e| format!("Invalid URL: {}", e))?))
            .auto_resize()
            .on_page_load(move |_webview, payload| {
                if let PageLoadEvent::Finished = payload.event() {
                    let _ = app_handle.emit("url-changed", serde_json::json!({
                        "label": webview_label,
                        "url": payload.url().as_str()
                    }));
                }
            });

        window.add_child(
            webview_builder,
            LogicalPosition::new(rect.x, rect.y),
            LogicalSize::new(rect.width, rect.height),
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn switch_tab(app: AppHandle, active_label: String, inactive_labels: Vec<String>, rect: Rect) -> Result<(), String> {
    for label in inactive_labels {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.set_size(tauri::Size::Logical(LogicalSize::new(0.0, 0.0)));
            // In some Tauri versions, hiding child webviews is better done by moving them or resizing
        }
    }

    if let Some(webview) = app.get_webview(&active_label) {
        let _ = webview.set_position(tauri::Position::Logical(LogicalPosition::new(rect.x, rect.y)));
        let _ = webview.set_size(tauri::Size::Logical(LogicalSize::new(rect.width, rect.height)));
        let _ = webview.set_focus();
    }
    Ok(())
}

#[tauri::command]
async fn close_tab(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn update_webview_rect(app: AppHandle, label: String, rect: Rect) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        let _ = webview.set_position(tauri::Position::Logical(LogicalPosition::new(rect.x, rect.y)));
        let _ = webview.set_size(tauri::Size::Logical(LogicalSize::new(rect.width, rect.height)));
    }
    Ok(())
}

#[tauri::command]
async fn go_back(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        let _ = webview.eval("window.history.back()");
    }
    Ok(())
}

#[tauri::command]
async fn go_forward(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        let _ = webview.eval("window.history.forward()");
    }
    Ok(())
}

#[tauri::command]
async fn refresh_page(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        let _ = webview.eval("window.location.reload()");
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let app_handle = app.handle().clone();

            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Resized(_) = event {
                    let _ = app_handle.emit("window-resized", ());
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            navigate_tab,
            switch_tab,
            close_tab,
            update_webview_rect,
            go_back,
            go_forward,
            refresh_page,
            add_history,
            get_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
