// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
mod ping;

use pankosmia_web;
use ping::wait_for_server;
use rocket::fairing::{Fairing, Info, Kind};
use rocket::{Request, Response};
use serde_json::json;
use tauri::path; // In second clause of resolve_file, DO NOT REMOVE
use tauri::App;
use tauri::Manager; // In second clause of resolve_file, DO NOT REMOVE

struct RemoveFrameOptions;

#[rocket::async_trait]
impl Fairing for RemoveFrameOptions {
    fn info(&self) -> Info {
        Info {
            name: "Remove X-Frame-Options",
            kind: Kind::Response,
        }
    }

    async fn on_response<'r>(&self, request: &'r Request<'_>, response: &mut Response<'r>) {
        if request.uri().path().starts_with("/") {
            response.remove_header("X-Frame-Options");
        }
    }
}
fn resolve_file(app: &tauri::AppHandle, to_resolve: String) -> tauri::Result<std::path::PathBuf> {
    #[cfg(debug_assertions)]
    const DEBUGMODE: bool = true;

    #[cfg(not(debug_assertions))]
    const DEBUGMODE: bool = false;

    if DEBUGMODE {
        return Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(to_resolve));
    } else {
        return app
            .path()
            .resolve(to_resolve, path::BaseDirectory::Resource);
    }
}

fn main() {
    let _ = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![wait_for_server])
        .setup(|app: &mut App| {
            let pankosmia_resources_path_buf =
                resolve_file(&app.handle(), "pankosmia_resources".to_string())
                    .expect("resolve file");
            let pankosmia_resources_path = pankosmia_resources_path_buf
                .as_os_str()
                .to_str()
                .unwrap()
                .to_string()
                + "/lib/";
            let working_dir = "".to_string();
            let webfont_path = format!("{}webfonts", pankosmia_resources_path);
            let app_setup_path = format!("{}setup/app_setup.json", pankosmia_resources_path);
            let local_setup_path = format!("{}setup/local_setup.json", pankosmia_resources_path);
            let app_resources_path = format!("{}", pankosmia_resources_path);

            let conf = json!({
                "working_dir": working_dir,
                "webfont_path": webfont_path,
                "app_setup_path": app_setup_path,
                "local_setup_path": local_setup_path,
                "app_resources_path": app_resources_path,
            });
            let rocket = pankosmia_web::rocket(conf).attach(RemoveFrameOptions);

            let rocket_fut = rocket.launch();

            tauri::async_runtime::spawn(async move {
                match rocket_fut.await {
                    Ok(_) => println!("PANKOSMIA: rocket shut down cleanly"),
                    Err(e) => eprintln!("PANKOSMIA: rocket FAILED to launch: {:?}", e),
                }
            });
            let two_secs = std::time::Duration::from_millis(2000);
            std::thread::sleep(two_secs);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Start Tauri");
}
