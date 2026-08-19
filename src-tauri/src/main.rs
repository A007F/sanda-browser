#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{AppHandle, Emitter, Manager, WebviewBuilder, WebviewUrl, LogicalPosition, LogicalSize};
use tauri::webview::PageLoadEvent;
use serde::{Serialize, Deserialize};

#[derive(Deserialize)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[tauri::command]
async fn navigate_to(app: AppHandle, url: String, rect: Rect) -> Result<(), String> {
    if let Some(webview) = app.get_webview("browser") {
        webview.navigate(url.parse().map_err(|e| format!("Invalid URL: {}", e))?)
            .map_err(|e| e.to_string())?;
    } else {
        let window = app.get_window("main").ok_or("Main window not found")?;

        let app_handle = app.clone();
        let webview_builder = WebviewBuilder::new("browser", WebviewUrl::External(url.parse().map_err(|e| format!("Invalid URL: {}", e))?))
            .auto_resize()
            .on_page_load(move |_webview, payload| {
                if let PageLoadEvent::Finished = payload.event() {
                    let _ = app_handle.emit("url-changed", payload.url().as_str());
                }
            });

        let _webview = window.add_child(
            webview_builder,
            LogicalPosition::new(rect.x, rect.y),
            LogicalSize::new(rect.width, rect.height),
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn update_webview_rect(app: AppHandle, rect: Rect) -> Result<(), String> {
    if let Some(webview) = app.get_webview("browser") {
        webview.set_position(tauri::Position::Logical(LogicalPosition::new(rect.x, rect.y))).map_err(|e| e.to_string())?;
        webview.set_size(tauri::Size::Logical(LogicalSize::new(rect.width, rect.height))).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn go_back(app: AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("browser") {
        // Trying native go_back if available, else fallback to eval
        let _ = webview.eval("window.history.back()");
    }
    Ok(())
}

#[tauri::command]
async fn go_forward(app: AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("browser") {
        let _ = webview.eval("window.history.forward()");
    }
    Ok(())
}

#[tauri::command]
async fn refresh_page(app: AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("browser") {
        webview.eval("window.location.reload()").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn set_opacity(_app: AppHandle, _opacity: f64) -> Result<(), String> {
    // window.set_opacity is not available in the current tauri version/configuration.
    Ok(())
}

#[tauri::command]
async fn close_browser_view(app: AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("browser") {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            // Listen for window resize to update child webview
            let app_handle = app.handle().clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Resized(_) = event {
                    // We can't easily get the DOM rect here,
                    // so we rely on the frontend to send us the rect after resize.
                    let _ = app_handle.emit("window-resized", ());
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            navigate_to,
            update_webview_rect,
            go_back,
            go_forward,
            refresh_page,
            set_opacity,
            close_browser_view
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
