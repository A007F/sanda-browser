#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn sync_browser_to_main(app: &tauri::AppHandle) {
    if let (Some(main), Some(browser)) = (
        app.get_webview_window("main"),
        app.get_webview_window("browser"),
    ) {
        if let (Ok(pos), Ok(size)) = (main.outer_position(), main.inner_size()) {
            let nav_h = 95_i32;
            let _ = browser.set_position(tauri::PhysicalPosition::new(
                pos.x,
                pos.y + nav_h,
            ));
            let _ = browser.set_size(tauri::PhysicalSize::new(
                size.width,
                size.height.saturating_sub(nav_h as u32),
            ));
        }
    }
}

#[tauri::command]
async fn navigate_to(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let parsed_url: tauri::Url = url.parse().map_err(|e| format!("{}", e))?;

    // إذا النافذة موجودة انتقل للرابط الجديد
    if let Some(existing) = app.get_webview_window("browser") {
        existing.navigate(parsed_url).map_err(|e| format!("{}", e))?;
        sync_browser_to_main(&app);
        return Ok(());
    }

    let main = app.get_webview_window("main").ok_or("no main")?;
    let pos  = main.outer_position().map_err(|e| format!("{}", e))?;
    let size = main.inner_size().map_err(|e| format!("{}", e))?;
    let nav_h = 95_u32;

    // نافذة browser تحتوي شريط الأدوات + WebView
    WebviewWindowBuilder::new(&app, "browser", WebviewUrl::External(parsed_url.clone()))
        .owner(&main)
        .map_err(|e| format!("{}", e))?
        .decorations(false)
        .skip_taskbar(true)
        .position(pos.x as f64, (pos.y + nav_h as i32) as f64)
        .inner_size(size.width as f64, (size.height - nav_h) as f64)
        .build()
        .map_err(|e| format!("{}", e))?;

    // بعد فتح النافذة ننشئ WebView داخلها للموقع
    // سنضيفه لاحقاً عبر navigate_site command
    let app_clone = app.clone();
    main.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                sync_browser_to_main(&app_clone);
            }
            tauri::WindowEvent::CloseRequested { .. } => {
                if let Some(b) = app_clone.get_webview_window("browser") {
                    let _ = b.close();
                }
            }
            _ => {}
        }
    });

    Ok(())
}

#[tauri::command]
async fn go_back(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(browser) = app.get_webview_window("browser") {
        browser
            .eval("window.history.back();")
            .map_err(|e| format!("{}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn go_forward(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(browser) = app.get_webview_window("browser") {
        browser
            .eval("window.history.forward();")
            .map_err(|e| format!("{}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn refresh_page(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(browser) = app.get_webview_window("browser") {
        browser
            .eval("window.location.reload();")
            .map_err(|e| format!("{}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn close_browser(_app: tauri::AppHandle) -> Result<(), String> {
    std::process::exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            navigate_to,
            go_back,
            go_forward,
            refresh_page,
            close_browser
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
