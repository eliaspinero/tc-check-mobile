// Hashes the embedded pankosmia_resources tree into PANKOSMIA_RESOURCES_STAMP, so the app can tell
// whether the copy it extracted on the phone came from this build (src/lib.rs, refresh_resources).
use std::hash::{Hash, Hasher};
use std::path::Path;

fn hash_dir(dir: &Path, base: &Path, hasher: &mut std::collections::hash_map::DefaultHasher) {
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .expect("pankosmia_resources is readable")
        .map(|e| e.expect("pankosmia_resources entry").path())
        .collect();
    entries.sort();
    for path in entries {
        path.strip_prefix(base).unwrap().to_string_lossy().hash(hasher);
        if path.is_dir() {
            hash_dir(&path, base, hasher);
        } else {
            std::fs::read(&path).expect("pankosmia_resources file").hash(hasher);
        }
    }
}

fn main() {
    let resources = Path::new("pankosmia_resources");
    println!("cargo:rerun-if-changed=pankosmia_resources");
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    hash_dir(resources, resources, &mut hasher);
    println!("cargo:rustc-env=PANKOSMIA_RESOURCES_STAMP={:016x}", hasher.finish());
    tauri_build::build()
}
