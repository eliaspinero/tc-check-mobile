// seed-tc <tC4 project without a journal> <new folder>: the same project in the Rust
// translationCore 4's format (#48), as tC4's own state seed makes it (STORAGE.md §13.2,
// `tc_app::backend::seed`). The folder gets the files tC4's scenario writer gives a seeded project
// (`WrittenProject::files` in crates/tc-app/src/backend/scenario_store.rs at c0d6e0e8), then one open
// and close by a store of its own, which materializes every derived file and seals the packs.
// The journeys' sample project is made with it (dev-env/seed/seed.mjs); never the phone.
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tc_app::backend::seed::{fixture_project_id, tc4_state_seed, Tc4Folder};
use tc_journal::fold::ProjectKind;
use tc_store::layout::{
    FORMAT_JSON, GITATTRIBUTES, GITATTRIBUTES_BYTES, GITIGNORE, GITIGNORE_BYTES, PROJECT_JSON,
};
use tc_store::{OpenOptions, StdFs, StdPlatform, Store, StoreConfig, SystemClock};

fn under(root: &Path, rel: &str) -> PathBuf {
    rel.split('/')
        .fold(root.to_owned(), |path, part| path.join(part))
}

fn main() {
    let mut args = std::env::args().skip(1);
    let (Some(src), Some(dst)) = (args.next(), args.next()) else {
        eprintln!("usage: seed-tc <tC4 project without a journal> <new folder>");
        std::process::exit(2);
    };
    let (src, dst) = (PathBuf::from(src), PathBuf::from(dst));
    assert!(!dst.exists(), "{} exists already", dst.display());
    let name = dst
        .file_name()
        .and_then(|n| n.to_str())
        .expect("a folder name")
        .to_owned();

    let folder = Tc4Folder::read(&src).unwrap_or_else(|e| panic!("{}: {e}", src.display()));
    let seed = tc4_state_seed(&folder, fixture_project_id(&name))
        .unwrap_or_else(|e| panic!("the seed: {e}"));

    let kind = match seed.kind {
        ProjectKind::Bible => "bible",
        ProjectKind::Stories => "obs",
    };
    let project_json = format!(
        "{{\"schemaVersion\":1,\"projectId\":\"{}\",\"kind\":\"{kind}\",\"created\":\"{}\"}}\n",
        seed.project,
        tc_store::appdata::rfc3339(seed.created)
    );
    let mut files: Vec<(String, Vec<u8>)> = vec![
        (GITIGNORE.to_owned(), GITIGNORE_BYTES.to_vec()),
        (GITATTRIBUTES.to_owned(), GITATTRIBUTES_BYTES.to_vec()),
        (
            FORMAT_JSON.to_owned(),
            tc_journal::format::FormatDoc::current().to_bytes(),
        ),
        (PROJECT_JSON.to_owned(), project_json.into_bytes()),
    ];
    files.extend(
        seed.packs
            .iter()
            .map(|pack| (pack.path.to_string(), pack.bytes.clone())),
    );
    for placement in seed.fold.carried_files() {
        let bytes = seed
            .carried
            .get(&placement.oid)
            .expect("the seed holds every carried file");
        files.push((placement.path.to_string(), bytes.clone()));
    }
    for (rel, bytes) in &files {
        let path = under(&dst, rel);
        std::fs::create_dir_all(path.parent().expect("a file path")).expect("a folder");
        std::fs::write(&path, bytes).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    }

    // Another installation than the rig's: the seed is tC4 desktop's work, not the phone's.
    let app_data = std::env::temp_dir().join(format!("tc-check-seed-{}", std::process::id()));
    let store = Store::start(StoreConfig {
        app_data: app_data.clone(),
        projects: app_data.join("projects"),
        vfs: Arc::new(StdFs),
        platform: Arc::new(StdPlatform),
        clock: Arc::new(SystemClock),
        threads: 2,
        watch_debounce: Duration::from_secs(1),
    })
    .expect("a store");
    let handle = store
        .open(&dst, &OpenOptions::default())
        .unwrap_or_else(|e| panic!("open {}: {e}", dst.display()));
    handle.close().expect("the first close checkpoints");
    let _ = std::fs::remove_dir_all(&app_data);
    println!("seeded {} from {}", dst.display(), src.display());
}
