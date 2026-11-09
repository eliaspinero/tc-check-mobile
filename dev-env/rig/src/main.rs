// The journeys' rig: pankosmia-web as the phone app starts it (shell/src-tauri/src/lib.rs
// setup_pankosmia), with the shell's own pankosmia_resources, on 127.0.0.1:19980.
// Usage: tc-check-rig <state dir>. ROCKET_PORT and ROCKET_ADDRESS override the address.
// Like the shell, it makes the state dir the home folder, where pankosmia-web keeps its repos
// (<state>/pankosmia_repos); its working folder is <state>/work.
use serde_json::json;
use std::env;
use std::path::Path;

// The shell's own upload limits, the same file (#37).
#[path = "../../../shell/src-tauri/src/limits.rs"]
mod limits;

// The shell's own decision routes (#48), the same file.
#[path = "../../../shell/src-tauri/src/tc.rs"]
mod tc;

#[rocket::main]
async fn main() -> Result<(), rocket::Error> {
    let state = env::args().nth(1).expect("usage: tc-check-rig <state dir>");
    std::fs::create_dir_all(&state).expect("create the state dir");
    let state = std::path::absolute(&state).expect("state dir");
    // pankosmia-web finds the home folder with the `home` crate: HOME, or USERPROFILE on Windows.
    env::set_var("HOME", &state);
    env::set_var("USERPROFILE", &state);
    let working_dir = Path::new(&state)
        .join("work")
        .to_str()
        .expect("utf-8 path")
        .to_string();
    if env::var("ROCKET_PORT").is_err() {
        env::set_var("ROCKET_PORT", "19980");
    }
    if env::var("ROCKET_ADDRESS").is_err() {
        env::set_var("ROCKET_ADDRESS", "127.0.0.1");
    }
    let resources = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../shell/src-tauri/pankosmia_resources/lib/"
    );
    let conf = json!({
        "working_dir": working_dir,
        "webfont_path": format!("{}webfonts", resources),
        "app_setup_path": format!("{}setup/app_setup.json", resources),
        "local_setup_path": format!("{}setup/local_setup.json", resources),
        "app_resources_path": resources,
    });
    // As the shell does: the store's application data beside Pankosmia's repositories. The
    // journeys' Door43 for every sync, when TC_CHECK_DOOR43 names one (a fake's URL).
    let door43 = env::var("TC_CHECK_DOOR43")
        .ok()
        .map(|url| url.parse().expect("TC_CHECK_DOOR43 is a Door43 URL"));
    let projects = tc::Projects::start(&state.join("tc"), state.join("pankosmia_repos"), door43)
        .expect("the tc store starts");
    // Uploads go through a folder of the rig's own, as the shell gives the phone's (#54).
    let uploads = state.join("uploads");
    std::fs::create_dir_all(&uploads).expect("create the uploads dir");
    tc::mount(
        limits::with_uploads(pankosmia_web::rocket(conf), &uploads),
        projects,
    )
    .launch()
    .await?;
    Ok(())
}
