mod device;
mod ping;
mod token;
use git2::opts::set_ssl_cert_file;
use include_dir::{include_dir, Dir};
use pankosmia_web;
use ping::wait_for_server;
use serde_json::json;
use tauri::App;
use tauri::Manager;
use rocket::fairing::{Fairing, Info, Kind};
use rocket::{Request, Response};

struct RemoveFrameOptions;

#[rocket::async_trait]
impl Fairing for RemoveFrameOptions {
    fn info(&self) -> Info {
        Info {
            name: "Remove X-Frame-Options",
            kind: Kind::Response,
        }
    }

    async fn on_response<'r>(
        &self,
        request: &'r Request<'_>,
        response: &mut Response<'r>,
    ) {
        if request.uri().path().starts_with("/") {
            response.remove_header("X-Frame-Options");
        }
    }
}
// Embeds the entire pankosmia_resources tree into the binary at compile time.
static PANKOSMIA_RESOURCES: Dir = include_dir!("$CARGO_MANIFEST_DIR/pankosmia_resources");

fn setup_pankosmia(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    let dest_resources = data_dir.join("pankosmia_resources");

    if !dest_resources.exists() {
        std::fs::create_dir_all(&dest_resources)?;
        PANKOSMIA_RESOURCES.extract(&dest_resources)?;
    }
    let cacert_path = dest_resources.join("cacert.pem");
    unsafe {
        match set_ssl_cert_file(cacert_path.as_path()) {
            Ok(_) => println!("PANKOSMIA: SSL cert file set successfully"),
            Err(e) => eprintln!("PANKOSMIA: SSL cert file failed: {}", e),
        }
    }
    // Just build the path — do NOT create this directory.
    // pankosmia_web's rocket() creates it itself via initialize_working_dir()
    // the first time it sees the dir doesn't exist yet, and that's what
    // populates app_state.json, user_settings.json, etc. from templates.
    std::fs::create_dir_all(&data_dir)?; // ensure the parent exists
    let working_dir_path = data_dir.join("working");
    let working_dir = working_dir_path
        .to_str()
        .ok_or("non-utf8 path")?
        .to_string();

    std::env::set_var("HOME", data_dir.to_str().ok_or("non-utf8 path")?);

    let pankosmia_resources_path =
        dest_resources.to_str().ok_or("non-utf8 path")?.to_string() + "/lib/";

    let webfont_path = format!("{}webfonts", pankosmia_resources_path);
    let app_setup_path = format!("{}setup/app_setup.json", pankosmia_resources_path);
    let local_setup_path = format!("{}setup/local_setup.json", pankosmia_resources_path);
    let conf = json!({
        "working_dir": working_dir,
        "webfont_path": webfont_path,
        "app_setup_path": app_setup_path,
        "local_setup_path": local_setup_path,
        "app_resources_path": pankosmia_resources_path,
    });

    println!("PANKOSMIA: resources path = {}", pankosmia_resources_path);
    println!("PANKOSMIA: working dir = {}", working_dir);
    println!("PANKOSMIA: conf = {}", conf);

    let rocket = pankosmia_web::rocket(conf).attach(RemoveFrameOptions);

    let rocket_fut = rocket.launch();
    let _ = tauri::async_runtime::spawn(async move {
        match rocket_fut.await {
            Ok(_) => println!("PANKOSMIA: rocket shut down cleanly"),
            Err(e) => eprintln!("PANKOSMIA: rocket FAILED to launch: {:?}", e),
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![wait_for_server, token::token_keep, token::token_read, token::token_forget, device::device_secret])
        .plugin(tauri_plugin_log::Builder::default().build())
        .setup(|app: &mut App| setup_pankosmia(app))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
