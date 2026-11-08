// The decision route's store calls (shell/src-tauri/src/tc.rs), on a copy of the journeys' sample
// project made in the Rust tC4's format by `seed-tc`.
// The routes and their status codes are the shell's and the rig's; these tests call the store side.
#[allow(dead_code)]
#[path = "../../../shell/src-tauri/src/tc.rs"]
mod tc;

use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Command;
use tc::{Decide, DecideError, Projects};

const SAMPLE: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../seed/sample-burrito");

fn temp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("tc-check-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("a temp folder");
    dir
}

/// `repos/<name>`: the sample in the new format, as seed-tc makes it.
fn seeded(repos: &Path, name: &str) {
    let status = Command::new(env!("CARGO_BIN_EXE_seed-tc"))
        .arg(SAMPLE)
        .arg(repos.join(name))
        .status()
        .expect("seed-tc runs");
    assert!(status.success(), "seed-tc failed");
}

fn decide_body(verse: u32, status: &str, selections: serde_json::Value) -> Decide {
    serde_json::from_value(json!({
        "tool": "translationWords",
        "contextId": {
            "checkId": "a9p2", "occurrenceNote": "", "reference": { "bookId": "tit", "chapter": 1, "verse": verse },
            "tool": "translationWords", "groupId": "apostle", "quote": "ἀπόστολος", "quoteString": "ἀπόστολος",
            "glQuote": "", "occurrence": 1
        },
        "category": "kt",
        "resource": { "repoPath": "git.door43.org/es-419_gl/es-419_twl", "sha": "c2d9547ec95e40c2ba085c597b127c94733feb8a" },
        "status": status,
        "selections": selections,
        "nothingToSelect": false
    }))
    .expect("a decide body")
}

fn decisions(repos: &Path, name: &str) -> serde_json::Value {
    let file = repos
        .join(name)
        .join("ingredients/checking/translationWords/TIT.json");
    serde_json::from_slice(&std::fs::read(&file).expect("the decision file")).expect("JSON")
}

fn the_decision<'a>(file: &'a serde_json::Value, check_id: &str) -> &'a serde_json::Value {
    file["decisions"]
        .as_array()
        .expect("decisions")
        .iter()
        .find(|d| d["contextId"]["checkId"] == check_id)
        .expect("the check is in the file")
}

fn packs(repos: &Path, name: &str) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut dirs = vec![repos.join(name).join("ingredients/tc/changes")];
    while let Some(dir) = dirs.pop() {
        for entry in std::fs::read_dir(&dir).expect("a folder").flatten() {
            let path = entry.path();
            if path.is_dir() {
                dirs.push(path);
            } else {
                out.push(path);
            }
        }
    }
    out.sort();
    out
}

#[test]
fn a_decision_is_sealed_into_a_pack_and_the_decision_file_follows() {
    let root = temp("decide");
    let repos = root.join("repos");
    seeded(&repos, "sample_tc");
    let before = packs(&repos, "sample_tc");
    let projects = Projects::start(&root.join("app"), repos.clone()).expect("the store starts");

    projects
        .decide(
            Path::new("sample_tc"),
            &decide_body(
                1,
                "valid",
                json!([{ "text": "siervo", "occurrence": 1, "occurrences": 1 }]),
            ),
        )
        .expect("the decision is recorded");

    let after = packs(&repos, "sample_tc");
    assert_eq!(after.len(), before.len() + 1, "one new pack: {after:?}");
    assert!(
        std::fs::read_dir(repos.join("sample_tc/.tc/pending")).map_or(true, |d| d.count() == 0),
        "nothing left pending"
    );
    let file = decisions(&repos, "sample_tc");
    let d = the_decision(&file, "a9p2");
    assert_eq!(
        d["selections"],
        json!([{ "text": "siervo", "occurrence": 1, "occurrences": 1 }]),
        "{d}"
    );
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn another_installation_reads_the_decision_from_the_packs() {
    let root = temp("reread");
    let repos = root.join("repos");
    seeded(&repos, "sample_tc");
    let phone = Projects::start(&root.join("phone"), repos.clone()).expect("the phone's store");
    phone
        .decide(
            Path::new("sample_tc"),
            &decide_body(1, "invalid", json!(false)),
        )
        .expect("the decision is recorded");
    // The decision file goes; a second installation (tC4 desktop) writes it again from the fold.
    std::fs::remove_file(repos.join("sample_tc/ingredients/checking/translationWords/TIT.json"))
        .expect("removed");
    let desktop = tc_store::Store::start(tc_store::StoreConfig {
        app_data: root.join("desktop"),
        projects: root.join("desktop/projects"),
        vfs: std::sync::Arc::new(tc_store::StdFs),
        platform: std::sync::Arc::new(tc_store::StdPlatform),
        clock: std::sync::Arc::new(tc_store::SystemClock),
        threads: 2,
        watch_debounce: std::time::Duration::from_secs(1),
    })
    .expect("the desktop's store");
    desktop
        .open(&repos.join("sample_tc"), &tc_store::OpenOptions::default())
        .expect("it opens")
        .close()
        .expect("it closes");
    let file = decisions(&repos, "sample_tc");
    let d = the_decision(&file, "a9p2");
    assert_eq!(d["selections"], json!(false), "{d}");
    assert_eq!(d["invalidated"], json!(false), "{d}");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn a_project_of_the_old_format_is_refused_and_left_as_it_was() {
    let root = temp("old");
    let repos = root.join("repos");
    let old = repos.join("old");
    std::fs::create_dir_all(&repos).expect("repos");
    copy_dir(Path::new(SAMPLE), &old);
    let projects = Projects::start(&root.join("app"), repos.clone()).expect("the store starts");
    let refused = projects.decide(Path::new("old"), &decide_body(1, "valid", json!(false)));
    assert!(matches!(refused, Err(DecideError::NotTc)), "{refused:?}");
    assert!(!old.join("ingredients/tc").exists(), "nothing was written");
    assert!(!old.join(".tc").exists(), "nothing was written");
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn a_clone_without_the_local_state_opens_and_takes_a_decision() {
    // What a Pankosmia clone of a Door43 repository in this format holds: every file but `.tc/`,
    // as seed-tc leaves it.
    let root = temp("clone");
    let repos = root.join("repos");
    seeded(&repos, "seeded");
    copy_dir(&repos.join("seeded"), &repos.join("cloned"));
    let projects = Projects::start(&root.join("app"), repos.clone()).expect("the store starts");
    projects
        .decide(Path::new("cloned"), &decide_body(1, "valid", json!(false)))
        .expect("the decision is recorded");
    assert_eq!(
        the_decision(&decisions(&repos, "cloned"), "a9p2")["contextId"]["checkId"],
        "a9p2"
    );
    std::fs::remove_dir_all(&root).ok();
}

fn copy_dir(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).expect("a folder");
    for entry in std::fs::read_dir(from).expect("a folder").flatten() {
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), &target).expect("a copy");
        }
    }
}

fn decide_at(verse: &str) -> Decide {
    let body = json!({
        "tool": "translationNotes",
        "contextId": {
            "checkId": "zz01", "reference": { "bookId": "tit", "chapter": 1, "verse": verse },
            "tool": "translationNotes", "groupId": "figs-metaphor", "quote": "", "occurrence": 1
        },
        "category": "figures",
        "resource": { "repoPath": "git.door43.org/es-419_gl/es-419_tn", "sha": "c2d9547ec95e40c2ba085c597b127c94733feb8a" },
        "status": "valid",
        "selections": false,
        "nothingToSelect": true
    });
    serde_json::from_value(body).expect("a decide body")
}

#[test]
fn a_check_on_a_chapter_front_a_lettered_verse_or_a_verse_list_is_recorded() {
    // tN and tW rows such as PSA 3:front, a verse with a letter, or a list of verses
    // (tC4 `RefPart`, crates/tc-journal/src/keys.rs).
    let root = temp("refs");
    let repos = root.join("repos");
    seeded(&repos, "sample_tc");
    let projects = Projects::start(&root.join("app"), repos.clone()).expect("the store starts");
    for verse in ["front", "1a", "1,3", "2-3"] {
        projects
            .decide(Path::new("sample_tc"), &decide_at(verse))
            .unwrap_or_else(|e| panic!("1:{verse}: {e}"));
    }
    std::fs::remove_dir_all(&root).ok();
}

#[test]
fn local_work_is_what_this_phone_decided_and_has_not_sent() {
    let root = temp("local");
    let repos = root.join("repos");
    seeded(&repos, "seeded");
    // As a Door43 clone, the seed holds no `.tc/`: nothing of this phone's yet.
    copy_dir(&repos.join("seeded"), &repos.join("cloned"));
    let projects = Projects::start(&root.join("app"), repos.clone()).expect("the store starts");
    assert!(!projects.has_local_work(Path::new("cloned")));
    projects
        .decide(Path::new("cloned"), &decide_body(1, "valid", json!(false)))
        .expect("the decision is recorded");
    assert!(projects.has_local_work(Path::new("cloned")));
    std::fs::remove_dir_all(&root).ok();
}
