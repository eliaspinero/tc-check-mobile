// Hashes the embedded pankosmia_resources tree into PANKOSMIA_RESOURCES_STAMP, so the app can tell
// whether the copy it extracted on the phone came from this build (src/lib.rs, refresh_resources).
//
// It also declares the shell's own commands to Tauri, which makes a permission for each one
// (`allow-token-keep`, ...). The client is served by the local server, an origin Tauri treats as
// remote, and a remote origin may call only the commands its capability allows (#50). The build
// fails when the commands src/lib.rs registers and the ones listed here, or their permissions in
// capabilities/default.json, drift apart.
use std::hash::{Hash, Hasher};
use std::path::Path;

fn hash_dir(dir: &Path, base: &Path, hasher: &mut std::collections::hash_map::DefaultHasher) {
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .expect("pankosmia_resources is readable")
        .map(|e| e.expect("pankosmia_resources entry").path())
        .collect();
    entries.sort();
    for path in entries {
        path.strip_prefix(base)
            .unwrap()
            .to_string_lossy()
            .hash(hasher);
        if path.is_dir() {
            hash_dir(&path, base, hasher);
        } else {
            std::fs::read(&path)
                .expect("pankosmia_resources file")
                .hash(hasher);
        }
    }
}

/// The shell's commands, as `src/lib.rs` registers them in `tauri::generate_handler!`.
const COMMANDS: &[&str] = &[
    "wait_for_server",
    "token_keep",
    "token_read",
    "token_forget",
];

/// The command names inside `generate_handler![...]` in `src/lib.rs`, without their module path.
fn registered_commands() -> Vec<String> {
    let lib = std::fs::read_to_string("src/lib.rs").expect("src/lib.rs is readable");
    let start = lib
        .find("generate_handler![")
        .expect("src/lib.rs registers its commands")
        + "generate_handler![".len();
    let end = start + lib[start..].find(']').expect("generate_handler! is closed");
    lib[start..end]
        .split(',')
        .map(|c| c.trim().rsplit("::").next().unwrap_or_default().to_owned())
        .filter(|c| !c.is_empty())
        .collect()
}

fn check_commands() {
    println!("cargo:rerun-if-changed=src/lib.rs");
    println!("cargo:rerun-if-changed=capabilities/default.json");
    let registered = registered_commands();
    assert_eq!(
        registered, COMMANDS,
        "src/lib.rs registers {registered:?}, but build.rs COMMANDS lists {COMMANDS:?}: list every registered command in COMMANDS"
    );
    let capability =
        std::fs::read_to_string("capabilities/default.json").expect("the capability is readable");
    for command in COMMANDS {
        let permission = format!("\"allow-{}\"", command.replace('_', "-"));
        assert!(
            capability.contains(&permission),
            "capabilities/default.json does not allow {command}: add {permission} to its permissions, or the client cannot call it (#50)"
        );
    }
}

fn main() {
    check_commands();
    let resources = Path::new("pankosmia_resources");
    println!("cargo:rerun-if-changed=pankosmia_resources");
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    hash_dir(resources, resources, &mut hasher);
    println!(
        "cargo:rustc-env=PANKOSMIA_RESOURCES_STAMP={:016x}",
        hasher.finish()
    );
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("tauri-build failed")
}
