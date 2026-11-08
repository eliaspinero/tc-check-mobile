//! A check decision written as the Rust translationCore 4 writes it (its `docs/STORAGE.md`
//! §5.4), through its own `tc-store`, at `POST /api/tc/decide/<repo path>`.
//!
//! The phone's projects are Pankosmia repositories under `<home>/pankosmia_repos/`. A project of
//! the Rust tC4's format (one with `ingredients/tc/project.json`) is opened, the decision is saved
//! as one `Check` change, and the project is closed again, which seals the change into a pack
//! under `ingredients/tc/changes/`, rewrites `ingredients/checking/<tool>/<BOOK>.json` from the
//! fold, and commits. The client reads that file back, so what it shows is the fold's projection.
//!
//! Nothing stays open between two requests: no lock is held while Pankosmia pulls, and two
//! decisions never share a half-finished state. `GET /api/tc/local-work/<repo path>` says
//! whether the phone has decisions of its own there, which Pankosmia's pull must not merge.
//! The shell and the journeys' rig both mount this file (`dev-env/rig/src/main.rs`), so the
//! journeys run this code.

use rocket::http::Status;
use rocket::serde::json::Json;
use rocket::serde::Deserialize;
use rocket::{Build, Rocket, State};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tc_journal::command::{Command, DecisionBasis, DecisionChange, DecisionEdit};
use tc_journal::keys::{CheckId, CheckKey, CheckTarget, RefPart, ToolId};
use tc_journal::record::{ResourceRef, Selection, UserStatus};
use tc_journal::{BookId, ChapterNo, GitOid, JsonMap, RecordKey, VerseNo};
use tc_store::{Mode, OpenError, OpenOptions, StdFs, StdPlatform, Store, StoreConfig, SystemClock};

/// The projects of this installation and where Pankosmia keeps their folders.
pub struct Projects {
    store: Store,
    repos: PathBuf,
    /// One decision at a time: a second open of a folder that is still open would be refused
    /// (`.tc/lock`), and a checker can tap Next and decide again before the first save is done.
    one_at_a_time: Mutex<()>,
}

impl Projects {
    /// Starts the store with its application data in `app_data` (the installation secret and
    /// the device ledger, STORAGE.md §3.7), for the Pankosmia repositories under `repos`.
    ///
    /// # Errors
    ///
    /// When `app_data` cannot be created or read.
    pub fn start(app_data: &Path, repos: PathBuf) -> Result<Self, tc_store::StoreError> {
        let store = Store::start(StoreConfig {
            app_data: app_data.to_owned(),
            // The phone creates no project of its own; Pankosmia clones them.
            projects: app_data.join("projects"),
            vfs: Arc::new(StdFs),
            platform: Arc::new(StdPlatform),
            clock: Arc::new(SystemClock),
            threads: 2,
            // The app's own value (STORAGE.md §11.1).
            watch_debounce: Duration::from_secs(1),
        })?;
        Ok(Self {
            store,
            repos,
            one_at_a_time: Mutex::new(()),
        })
    }

    /// Records one decision on the check `body` names, in the project at `repo` (a Pankosmia
    /// repo path such as `git.door43.org/<org>/<repo>`), and closes the project again.
    ///
    /// # Errors
    ///
    /// [`DecideError::NotTc`] for a folder that is not of the Rust tC4's format (a tC4 4.x or
    /// an older project), [`DecideError::BadRequest`] for a body that names no check, and the
    /// store's own refusal otherwise, in its words.
    pub fn decide(&self, repo: &Path, body: &Decide) -> Result<(), DecideError> {
        let edit = body.edit()?;
        let (key, verse) = body.keys()?;
        let _one = self
            .one_at_a_time
            .lock()
            .expect("the decision lock is poisoned");
        let handle = self
            .store
            .open(&self.repos.join(repo), &OpenOptions::default())
            .map_err(|e| match e {
                OpenError::NotAProject => DecideError::NotTc,
                other => DecideError::Store(other.to_string()),
            })?;
        if let Mode::ReadOnly(reason) = handle.facts().mode {
            let _ = handle.close();
            return Err(DecideError::Store(format!(
                "the project is open read-only: {reason:?}"
            )));
        }
        // The screen showed the fold as it is now: the list was read from this fold's projection,
        // and nothing else writes the project while a decision is made (one at a time, above).
        let saved = (|| {
            let shown = handle
                .mint(&RecordKey::Check(key), None)
                .map_err(|e| DecideError::Store(e.to_string()))?;
            let verse_shown = handle
                .mint(&verse, None)
                .map_err(|e| DecideError::Store(e.to_string()))?;
            handle
                .submit(Command::SaveDecision {
                    shown,
                    verse_shown,
                    value: edit,
                })
                .wait()
                .map_err(|e| DecideError::Store(e.to_string()))
        })();
        // Closing checkpoints: the change is sealed into a pack, the decision file is written
        // again from the fold, and the folder is committed (STORAGE.md §5.13).
        let closed = handle
            .close()
            .map_err(|e| DecideError::Store(e.to_string()));
        saved?;
        closed
    }

    /// Whether this phone has recorded decisions in the project at `repo` (its `.tc/`, which
    /// the first decision creates and a Door43 clone never holds, as it is git-ignored). Until
    /// the phone can sync them (#48, slice 48b), Pankosmia's pull would merge its commits with
    /// Door43's and leave conflict markers in the decision files. It waits for a decision that
    /// is being recorded, so a Sync tapped right after one sees it.
    pub fn has_local_work(&self, repo: &Path) -> bool {
        let _one = self
            .one_at_a_time
            .lock()
            .expect("the decision lock is poisoned");
        self.repos.join(repo).join(".tc").is_dir()
    }
}

/// Why a decision was not recorded.
#[derive(Debug, thiserror::Error)]
pub enum DecideError {
    #[error("this project is not in the new translationCore's format")]
    NotTc,
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    Store(String),
}

impl DecideError {
    fn status(&self) -> Status {
        match self {
            Self::NotTc => Status::Conflict,
            Self::BadRequest(_) => Status::BadRequest,
            Self::Store(_) => Status::InternalServerError,
        }
    }
}

/// The resource the check list came from (STORAGE.md §5.4 `resource`).
#[derive(Debug, Deserialize)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct Resource {
    pub repo_path: String,
    pub sha: String,
}

/// One tC4 selection, as the decision files write it.
#[derive(Debug, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct Selected {
    pub text: String,
    pub occurrence: u32,
    pub occurrences: u32,
}

/// What a Check button records: the check (its tC4 `contextId` and `category`), the list's
/// resource, and the button's patch (the client's `engine.patch`, tC4 `recordDecision`).
#[derive(Debug, Deserialize)]
#[serde(crate = "rocket::serde", rename_all = "camelCase")]
pub struct Decide {
    pub tool: String,
    pub context_id: rocket::serde::json::Value,
    pub category: String,
    pub resource: Resource,
    pub status: String,
    /// The words, or `false` for none, as tC4 writes `selections`.
    pub selections: rocket::serde::json::Value,
    pub nothing_to_select: bool,
}

fn bad(what: impl std::fmt::Display) -> DecideError {
    DecideError::BadRequest(what.to_string())
}

impl Decide {
    /// The store's edit: the button's changes, with the check's context and category for a
    /// first decision.
    fn edit(&self) -> Result<DecisionEdit, DecideError> {
        let status = match self.status.as_str() {
            "valid" => UserStatus::Valid,
            "invalid" => UserStatus::Invalid,
            other => return Err(bad(format!("unknown status {other:?}"))),
        };
        let selections = match &self.selections {
            rocket::serde::json::Value::Bool(false) => None,
            words => {
                let words: Vec<Selected> =
                    rocket::serde::json::from_value(words.clone()).map_err(bad)?;
                let words: Vec<Selection> = words
                    .into_iter()
                    .map(|w| Selection {
                        text: w.text,
                        occurrence: w.occurrence,
                        occurrences: w.occurrences,
                        extra: JsonMap::new(),
                    })
                    .collect();
                Some(words)
            }
        };
        let context = match tc_journal::Json::try_from(&self.context_id)
            .map_err(|e| bad(format!("contextId: {e}")))?
        {
            tc_journal::Json::Obj(map) => map,
            _ => return Err(bad("contextId is not an object")),
        };
        Ok(DecisionEdit {
            basis: Some(DecisionBasis {
                context,
                category: Some(self.category.as_str().into()),
            }),
            resource: ResourceRef {
                repo_path: self.resource.repo_path.as_str().into(),
                sha: GitOid::parse(&self.resource.sha).ok_or_else(|| bad("resource sha"))?,
            },
            changes: vec![
                DecisionChange::Selections(selections),
                DecisionChange::NothingToSelect(self.nothing_to_select),
                DecisionChange::Status(Some(status)),
            ],
        })
    }

    /// The check's key and the key of the text its words are taken from: the chapter's front
    /// for `front`, else the first verse a part names (`9` of `9-10`, which holds the span's
    /// text, STORAGE.md §0 item 3; `1` of `1a` or `1,3`). The store reads no text for a part
    /// that is not one verse or span, and records the decision against the empty text (§7.7).
    fn keys(&self) -> Result<(CheckKey, RecordKey), DecideError> {
        let tool = ToolId::parse(&self.tool)
            .ok_or_else(|| bad(format!("unknown tool {:?}", self.tool)))?;
        let field = |name: &str| {
            self.context_id
                .get(name)
                .ok_or_else(|| bad(format!("contextId has no {name}")))
        };
        let text = |v: &rocket::serde::json::Value| match v {
            rocket::serde::json::Value::String(s) => Ok(s.clone()),
            rocket::serde::json::Value::Number(n) => Ok(n.to_string()),
            other => Err(bad(format!("{other} is not a reference part"))),
        };
        let reference = field("reference")?;
        let part = |name: &str| {
            reference
                .get(name)
                .ok_or_else(|| bad(format!("reference has no {name}")))
                .and_then(text)
        };
        let book: BookId = part("bookId")?
            .to_uppercase()
            .parse()
            .map_err(|_| bad("unknown book"))?;
        let (chapter, verse) = (part("chapter")?, part("verse")?);
        let occurrence = field("occurrence")?
            .as_u64()
            .and_then(|n| u32::try_from(n).ok())
            .ok_or_else(|| bad("occurrence"))?;
        let check_id = field("checkId")?.as_str().ok_or_else(|| bad("checkId"))?;
        let key = CheckKey {
            tool,
            check_id: CheckId::parse(check_id).map_err(bad)?,
            target: CheckTarget::Verse {
                book,
                chapter: RefPart::parse(&chapter).map_err(bad)?,
                verse: RefPart::parse(&verse).map_err(bad)?,
            },
            occurrence,
        };
        let leading = |s: &str| {
            let digits: String = s.chars().take_while(char::is_ascii_digit).collect();
            digits.parse::<u16>().ok()
        };
        let chapter_no = leading(&chapter)
            .and_then(ChapterNo::new)
            .ok_or_else(|| bad(format!("{chapter}:{verse} names no chapter")))?;
        let text = if verse == "front" {
            RecordKey::ChapterFront(book, chapter_no)
        } else {
            let verse_no = leading(&verse)
                .and_then(VerseNo::new)
                .ok_or_else(|| bad(format!("{chapter}:{verse} names no verse")))?;
            RecordKey::Verse(book, chapter_no, verse_no)
        };
        Ok((key, text))
    }
}

#[rocket::post("/decide/<repo..>", data = "<body>")]
async fn decide(
    repo: PathBuf,
    body: Json<Decide>,
    projects: &State<Arc<Projects>>,
) -> Result<(), (Status, String)> {
    let projects = Arc::clone(projects);
    // tc-store's calls block; keep them off the server's async workers.
    rocket::tokio::task::spawn_blocking(move || projects.decide(&repo, &body))
        .await
        .map_err(|e| (Status::InternalServerError, e.to_string()))?
        .map_err(|e| (e.status(), e.to_string()))
}

/// `{"localWork": true}` when this phone has decisions of its own in the project (see
/// [`Projects::has_local_work`]).
#[rocket::get("/local-work/<repo..>")]
async fn local_work(
    repo: PathBuf,
    projects: &State<Arc<Projects>>,
) -> Result<Json<rocket::serde::json::Value>, (Status, String)> {
    let projects = Arc::clone(projects);
    let local = rocket::tokio::task::spawn_blocking(move || projects.has_local_work(&repo))
        .await
        .map_err(|e| (Status::InternalServerError, e.to_string()))?;
    Ok(Json(rocket::serde::json::json!({ "localWork": local })))
}

/// Mounts the routes at `/api/tc`, beside Pankosmia's `/api` routes.
pub fn mount(rocket: Rocket<Build>, projects: Projects) -> Rocket<Build> {
    rocket
        .manage(Arc::new(projects))
        .mount("/api/tc", rocket::routes![decide, local_work])
}
