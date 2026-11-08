// The decision route's store calls (shell/src-tauri/src/tc.rs), on a copy of the journeys' sample
// project made in the Rust tC4's format by `seed-tc`.
// The routes and their status codes are the shell's and the rig's; these tests call the store side.
#[allow(dead_code)]
#[path = "../../../shell/src-tauri/src/tc.rs"]
mod tc;

use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Command;
use tc::{Decide, DecideError, Projects, Synced};

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
    let projects =
        Projects::start(&root.join("app"), repos.clone(), None).expect("the store starts");

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
    let phone =
        Projects::start(&root.join("phone"), repos.clone(), None).expect("the phone's store");
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
    let projects =
        Projects::start(&root.join("app"), repos.clone(), None).expect("the store starts");
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
    let projects =
        Projects::start(&root.join("app"), repos.clone(), None).expect("the store starts");
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
    let projects =
        Projects::start(&root.join("app"), repos.clone(), None).expect("the store starts");
    for verse in ["front", "1a", "1,3", "2-3"] {
        projects
            .decide(Path::new("sample_tc"), &decide_at(verse))
            .unwrap_or_else(|e| panic!("1:{verse}: {e}"));
    }
    std::fs::remove_dir_all(&root).ok();
}

// ---- Sync with Door43 (#48), against the Rust tC4's own fake Door43 ----

/// One installation: its store and its Pankosmia repos, syncing with `door43`.
fn installation(root: &Path, name: &str, door43: &str) -> (Projects, PathBuf) {
    let repos = root.join(name).join("repos");
    std::fs::create_dir_all(&repos).expect("repos");
    let projects = Projects::start(
        &root.join(name).join("app"),
        repos.clone(),
        Some(door43.parse().expect("the fake's url")),
    )
    .expect("the store starts");
    (projects, repos)
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce(&tokio::runtime::Handle) -> T + Send + 'static,
) -> T {
    let runtime = tokio::runtime::Handle::current();
    tokio::task::spawn_blocking(move || f(&runtime))
        .await
        .expect("the blocking call")
}

fn selection_of(repos: &Path, repo: &str, check_id: &str) -> serde_json::Value {
    let file = repos
        .join(repo)
        .join("ingredients/checking/translationWords/TIT.json");
    let file: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&file).expect("the decision file")).expect("JSON");
    the_decision(&file, check_id)["selections"].clone()
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_decision_reaches_another_installation_through_door43_and_one_comes_back() {
    use tc_door43_fake::{seeded, FakeDoor43};
    let fake = FakeDoor43::start_seeded().await.expect("the fake Door43");
    let internet = tc_door43::InternetSwitch::new();
    internet.turn_on();
    let client =
        tc_door43::Door43Client::new(fake.url().parse().expect("url"), internet).expect("a client");
    let credentials = tc_door43::Credentials::new(
        seeded::USER,
        tc_door43::Password::new(seeded::PASSWORD.to_owned()),
    )
    .expect("credentials");
    let session = client
        .mint_token(
            &credentials,
            &"tc-check".parse().expect("a token name"),
            &tc_door43::TokenScope::FOR_SHARING,
        )
        .await
        .expect("a token");
    client
        .create_repo(
            &session,
            &tc_door43::NewRepoOwner::SignedInUser,
            &"sample_tc".parse().expect("a name"),
            tc_door43::Visibility::Public,
        )
        .await
        .expect("the repository");
    let repo = format!("door43/{}/sample_tc", seeded::USER);
    let root = temp("sync");

    // tC4 desktop: the project in the new format, put on Door43 by its first sync.
    let (desktop, desktop_repos) = installation(&root, "desktop", fake.url());
    seeded(&desktop_repos, &repo);
    let (repo_d, session_d) = (repo.clone(), session.clone());
    let desktop = std::sync::Arc::new(desktop);
    let d = desktop.clone();
    let first = blocking(move |rt| d.sync(rt, Path::new(&repo_d), session_d))
        .await
        .expect("the desktop syncs");
    assert!(matches!(first, Synced::Done { .. }), "{first:?}");

    // The phone: a Pankosmia clone of it, a decision, a sync.
    let (phone, phone_repos) = installation(&root, "phone", fake.url());
    let status = Command::new("git")
        .args(["clone", "-q", &fake.clone_url(seeded::USER, "sample_tc")])
        .arg(phone_repos.join(&repo))
        .status()
        .expect("git clone");
    assert!(status.success());
    phone
        .decide(
            Path::new(&repo),
            &decide_body(
                1,
                "valid",
                json!([{ "text": "siervo", "occurrence": 1, "occurrences": 1 }]),
            ),
        )
        .expect("the phone decides");
    let phone = std::sync::Arc::new(phone);
    let (p, repo_p, session_p) = (phone.clone(), repo.clone(), session.clone());
    let sent = blocking(move |rt| p.sync(rt, Path::new(&repo_p), session_p))
        .await
        .expect("the phone syncs");
    assert!(
        matches!(
            sent,
            Synced::Done {
                confirmed: true,
                ..
            }
        ),
        "{sent:?}"
    );

    // The desktop takes it in.
    let (d, repo_d, session_d) = (desktop.clone(), repo.clone(), session.clone());
    let got = blocking(move |rt| d.sync(rt, Path::new(&repo_d), session_d))
        .await
        .expect("the desktop syncs");
    assert!(
        matches!(got, Synced::Done { received: true, .. }),
        "{got:?}"
    );
    assert_eq!(
        selection_of(&desktop_repos, &repo, "a9p2"),
        json!([{ "text": "siervo", "occurrence": 1, "occurrences": 1 }])
    );

    // And one comes back: the desktop decides invalid, the phone syncs.
    desktop
        .decide(Path::new(&repo), &decide_body(1, "invalid", json!(false)))
        .expect("the desktop decides");
    let (d, repo_d, session_d) = (desktop.clone(), repo.clone(), session.clone());
    blocking(move |rt| d.sync(rt, Path::new(&repo_d), session_d))
        .await
        .expect("the desktop syncs");
    let (p, repo_p, session_p) = (phone.clone(), repo.clone(), session.clone());
    let back = blocking(move |rt| p.sync(rt, Path::new(&repo_p), session_p))
        .await
        .expect("the phone syncs");
    assert!(
        matches!(back, Synced::Done { received: true, .. }),
        "{back:?}"
    );
    assert_eq!(selection_of(&phone_repos, &repo, "a9p2"), json!(false));
    std::fs::remove_dir_all(&root).ok();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_sync_without_door43_fails_in_tc4s_words_and_keeps_the_decision() {
    let root = temp("offline");
    // A port nothing listens on.
    let (phone, repos) = installation(&root, "phone", "http://127.0.0.1:9");
    let repo = "door43/someone/sample_tc";
    seeded(&repos, repo);
    phone
        .decide(Path::new(repo), &decide_body(1, "valid", json!(false)))
        .expect("the decision");
    let session = tc_door43::Session {
        username: "someone".parse().expect("a name"),
        token: tc_door43::Token::new("a-token".to_owned()).expect("a token"),
    };
    let phone = std::sync::Arc::new(phone);
    let p = phone.clone();
    let failed = blocking(move |rt| p.sync(rt, Path::new(repo), session))
        .await
        .expect("the sync runs");
    let Synced::Failed(failure) = failed else {
        panic!("{failed:?}")
    };
    assert_eq!(failure["value"]["type"], "unreachable", "{failure}");
    assert_eq!(selection_of(&repos, repo, "a9p2"), json!(false));
    std::fs::remove_dir_all(&root).ok();
}
