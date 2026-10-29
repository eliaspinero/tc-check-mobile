mod device;
mod limits;
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

// Which embedded resources this build carries (build.rs hashes pankosmia_resources).
const RESOURCES_STAMP: &str = env!("PANKOSMIA_RESOURCES_STAMP");

// Puts the embedded resources at `dest`. The copy there is served, not the embedded one, so an
// update installed over an older build replaces it, or the phone keeps running the older client.
// The stamp sits outside `dest` and is written last: an extraction cut short is redone next start.
// Nothing the user makes lives in `dest` (projects and settings are in the working directory).
fn refresh_resources(
    resources: &Dir,
    dest: &std::path::Path,
    stamp_file: &std::path::Path,
    stamp: &str,
) -> std::io::Result<()> {
    if dest.exists() && std::fs::read_to_string(stamp_file).ok().as_deref() == Some(stamp) {
        return Ok(());
    }
    if dest.exists() {
        std::fs::remove_dir_all(dest)?;
    }
    std::fs::create_dir_all(dest)?;
    resources.extract(dest)?;
    std::fs::write(stamp_file, stamp)
}

fn setup_pankosmia(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app.path().app_data_dir()?;
    let dest_resources = data_dir.join("pankosmia_resources");

    refresh_resources(
        &PANKOSMIA_RESOURCES,
        &dest_resources,
        &data_dir.join("pankosmia_resources.stamp"),
        RESOURCES_STAMP,
    )?;
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

    let rocket = limits::with_upload_limits(pankosmia_web::rocket(conf)).attach(RemoveFrameOptions);

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

#[cfg(test)]
mod tests {
    use super::*;
    use include_dir::include_dir;

    static RESOURCES: Dir = include_dir!("$CARGO_MANIFEST_DIR/pankosmia_resources/lib/setup");

    #[test]
    fn an_update_replaces_the_resources_of_the_build_before() {
        let root = std::env::temp_dir().join(format!("tc-check-refresh-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let dest = root.join("pankosmia_resources");
        let stamp_file = root.join("pankosmia_resources.stamp");
        let fresh = dest.join("app_setup.json");
        let stale = dest.join("from-the-build-before.txt");

        // First start: the resources are extracted.
        refresh_resources(&RESOURCES, &dest, &stamp_file, "build-1").unwrap();
        assert!(fresh.exists());

        // A restart of the same build leaves the copy alone.
        std::fs::write(&stale, "old").unwrap();
        refresh_resources(&RESOURCES, &dest, &stamp_file, "build-1").unwrap();
        assert!(stale.exists());

        // An update replaces it.
        refresh_resources(&RESOURCES, &dest, &stamp_file, "build-2").unwrap();
        assert!(!stale.exists(), "the update kept the resources of the build before");
        assert!(fresh.exists());

        std::fs::remove_dir_all(&root).unwrap();
    }
}
