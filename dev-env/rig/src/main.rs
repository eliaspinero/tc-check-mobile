// The journeys' rig: pankosmia-web as the phone app starts it (shell/src-tauri/src/lib.rs
// setup_pankosmia), with the shell's own pankosmia_resources, on 127.0.0.1:19980.
// Usage: tc-check-rig <state dir>. ROCKET_PORT and ROCKET_ADDRESS override the address.
// Like the shell, it makes the state dir the home folder, where pankosmia-web keeps its repos
// (<state>/pankosmia_repos); its working folder is <state>/work.
use serde_json::json;
use std::env;
use std::path::Path;

#[rocket::main]
async fn main() -> Result<(), rocket::Error> {
    let state = env::args().nth(1).expect("usage: tc-check-rig <state dir>");
    std::fs::create_dir_all(&state).expect("create the state dir");
    let state = std::path::absolute(&state).expect("state dir");
    // pankosmia-web finds the home folder with the `home` crate: HOME, or USERPROFILE on Windows.
    env::set_var("HOME", &state);
    env::set_var("USERPROFILE", &state);
    let working_dir = Path::new(&state).join("work").to_str().expect("utf-8 path").to_string();
    if env::var("ROCKET_PORT").is_err() {
        env::set_var("ROCKET_PORT", "19980");
    }
    if env::var("ROCKET_ADDRESS").is_err() {
        env::set_var("ROCKET_ADDRESS", "127.0.0.1");
    }
    let resources = concat!(env!("CARGO_MANIFEST_DIR"), "/../../shell/src-tauri/pankosmia_resources/lib/");
    let conf = json!({
        "working_dir": working_dir,
        "webfont_path": format!("{}webfonts", resources),
        "app_setup_path": format!("{}setup/app_setup.json", resources),
        "local_setup_path": format!("{}setup/local_setup.json", resources),
        "app_resources_path": resources,
    });
    pankosmia_web::rocket(conf).launch().await?;
    Ok(())
}
